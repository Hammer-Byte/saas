import { Key } from "selenium-webdriver";
import { logger } from "@hammerbyte/utils";
import { contentPublishSleep, openUrl } from "../content_publish_browser.js";
import { failWithScreenshot } from "../content_publish_screenshot.js";

/**
 * YouTube Community image post on a specific channel (brand accounts supported).
 *
 * Critical: stay on /channel/{UC…}/posts — never fall back to homepage Create
 * (that posts as the default/personal channel).
 */

function normalizeChannelId(value) {
    const text = String(value || "").trim();
    if (!text) {
        return "";
    }
    const fromUrl = text.match(/channel\/(UC[\w-]+)/i);
    if (fromUrl) {
        return fromUrl[1];
    }
    if (/^UC[\w-]+$/i.test(text)) {
        return text;
    }
    return "";
}

async function failStep(driver, message, label = "yt-fail") {
    await failWithScreenshot(driver, message, label);
}

async function clickByLabel(driver, patterns) {
    return await driver.executeScript(
        `
      const patterns = arguments[0].map((source) => new RegExp(source, "i"));
      const nodes = [...document.querySelectorAll(
        "button, yt-button-shape button, a, tp-yt-paper-button, div[role='button'], yt-icon-button"
      )];
      for (const pattern of patterns) {
        const el = nodes.find((node) => {
          const aria = (node.getAttribute("aria-label") || "").trim();
          const text = (node.innerText || "").replace(/\\s+/g, " ").trim();
          return pattern.test(aria) || pattern.test(text);
        });
        if (el) {
          el.click();
          return true;
        }
      }
      return false;
    `,
        patterns,
    );
}

async function dismissCommunityIntro(driver) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const clicked = await clickByLabel(driver, ["^not now$", "^got it$", "^no thanks$"]);
        if (!clicked) {
            return;
        }
        await contentPublishSleep(1000);
    }
}

async function diagnoseChannelContext(driver, channelId) {
    return await driver.executeScript(
        `
      const wanted = String(arguments[0] || "");
      const href = String(location.href || "");
      const html = String(document.documentElement?.innerHTML || "");
      const text = String(document.body?.innerText || "");
      const inUrl = wanted && href.includes(wanted);
      const inHtml = wanted && html.includes(wanted);
      const hasAddImage = [...document.querySelectorAll("button, yt-button-shape button")].some((el) => {
        const aria = (el.getAttribute("aria-label") || "").trim();
        const label = ((el.innerText || "") + " " + aria).replace(/\\s+/g, " ").trim();
        return /^add an image$/i.test(aria) || /^image$/i.test(label);
      });
      const hasCaption = !!document.querySelector("#contenteditable-root, [contenteditable='true']");
      const hasImageFile = [...document.querySelectorAll("input[type='file']")].some((input) => {
        const accept = (input.getAttribute("accept") || "").toLowerCase();
        return accept.includes("image");
      });
      const hasPost = [...document.querySelectorAll("button, yt-button-shape button")].some((el) => {
        const aria = (el.getAttribute("aria-label") || "").trim();
        const label = (el.innerText || "").replace(/\\s+/g, " ").trim();
        return /^post$/i.test(aria) || /^post$/i.test(label);
      });
      const communityComposer = /share a |behind-the-scenes|image poll|visibility:/i.test(text.slice(0, 4000));
      return {
        url: href,
        inUrl,
        inHtml,
        matched: !!(inUrl || inHtml),
        hasCompose: !!(hasAddImage || hasCaption || hasImageFile || (hasPost && communityComposer)),
        hasAddImage,
        hasCaption,
        hasImageFile,
        hasPost,
        communityComposer,
        snippet: text.slice(0, 220),
      };
    `,
        channelId,
    );
}

async function assertChannelContext(driver, channelId, label) {
    const state = await diagnoseChannelContext(driver, channelId);
    logger.info(
        `content-publish yt channel-check matched=${state.matched} inUrl=${state.inUrl} compose=${state.hasCompose} url=${state.url}`,
    );
    if (!state.matched) {
        await failStep(
            driver,
            `YouTube channel context mismatch (wanted=${channelId}, ${JSON.stringify(state)})`,
            label,
        );
    }
    return state;
}

async function switchViaAccountSwitcher(driver, channelId) {
    logger.info("content-publish yt opening channel_switcher");
    await openUrl(
        driver,
        `https://www.youtube.com/channel_switcher?next=${encodeURIComponent(
            `/channel/${channelId}/posts?show_create_dialog=1`,
        )}`,
    );
    await contentPublishSleep(4000);

    const clicked = await driver.executeScript(
        `
      const wanted = String(arguments[0] || "");
      const items = [...document.querySelectorAll(
        "ytd-account-item-renderer, a[href*='channel/'], a[href*='/@'], tp-yt-paper-item"
      )];
      const hit = items.find((el) => {
        const href = el.getAttribute("href")
          || el.querySelector?.("a")?.getAttribute("href")
          || "";
        const text = ((el.innerText || "") + " " + href).replace(/\\s+/g, " ");
        return href.includes(wanted) || text.includes(wanted);
      });
      if (!hit) {
        return { ok: false, count: items.length };
      }
      const clickable = hit.querySelector("a") || hit;
      clickable.click();
      return { ok: true, text: (hit.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 100) };
    `,
        channelId,
    );
    logger.info(`content-publish yt switcher click=${JSON.stringify(clicked)}`);
    await contentPublishSleep(4500);
    return clicked?.ok === true;
}

async function establishChannelContext(driver, channelId) {
    // Studio forces the session onto that brand channel when possible.
    logger.info(`content-publish yt switch studio channel=${channelId}`);
    await openUrl(driver, `https://studio.youtube.com/channel/${channelId}`);
    await contentPublishSleep(3500);

    let state = await diagnoseChannelContext(driver, channelId);
    if (state.matched && /studio\.youtube\.com\/channel\//i.test(state.url)) {
        logger.info("content-publish yt studio channel context ok");
        return;
    }

    const switched = await switchViaAccountSwitcher(driver, channelId);
    state = await diagnoseChannelContext(driver, channelId);
    if (!state.matched && !switched) {
        await failStep(
            driver,
            `YouTube could not switch to channel ${channelId} (${JSON.stringify(state)})`,
            "yt-channel-switch",
        );
    }
}

async function openCreatePostDialog(driver, channelId) {
    await establishChannelContext(driver, channelId);

    const postsUrl = `https://www.youtube.com/channel/${channelId}/posts?show_create_dialog=1`;
    logger.info(`content-publish yt open posts create ${postsUrl}`);
    await openUrl(driver, postsUrl);
    await contentPublishSleep(5000);
    await dismissCommunityIntro(driver);

    let state = await assertChannelContext(driver, channelId, "yt-posts-channel");
    if (state.hasCompose) {
        logger.info("content-publish yt compose ready on channel posts");
        return;
    }

    // Stay on this channel — wait longer; do not go to homepage Create.
    logger.info("content-publish yt waiting for community composer on channel posts");
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        state = await diagnoseChannelContext(driver, channelId);
        if (!state.matched) {
            await failStep(
                driver,
                `YouTube left channel context while waiting (${JSON.stringify(state)})`,
                "yt-posts-channel-lost",
            );
        }
        if (state.hasCompose) {
            logger.info("content-publish yt compose became ready on channel posts");
            return;
        }
        await contentPublishSleep(1000);
    }

    // Last resort: re-open posts after explicit switcher selection.
    await switchViaAccountSwitcher(driver, channelId);
    await openUrl(driver, postsUrl);
    await contentPublishSleep(5000);
    state = await assertChannelContext(driver, channelId, "yt-posts-after-switcher");
    if (!state.hasCompose) {
        await failStep(
            driver,
            `YouTube step2 create UI missing for channel ${channelId} (${JSON.stringify(state)})`,
            "yt-step2",
        );
    }
}

async function attachImage(driver, mediaPath) {
    // Must activate the community image flow first; bare file inputs can miss the composer.
    logger.info("content-publish yt clicking Add an image");
    const clicked = await clickByLabel(driver, ["^add an image$", "^image$"]);
    if (!clicked) {
        await failStep(driver, "YouTube step3 Add an image control missing", "yt-step3");
    }
    await contentPublishSleep(1500);

    const inputs = await driver.findElements({ css: "input[type=file]" });
    const imageInputs = [];
    for (const input of inputs) {
        const accept = String((await input.getAttribute("accept")) || "").toLowerCase();
        const className = String((await input.getAttribute("class")) || "");
        if (/image/.test(accept) && !/searchbox/i.test(className)) {
            imageInputs.push({ input, accept });
        }
    }
    if (!imageInputs.length) {
        await failStep(driver, "YouTube step3 image file input missing", "yt-step3");
    }

    // Prefer accept=image/* community uploader.
    let chosen = imageInputs[0].input;
    for (const item of imageInputs) {
        if (item.accept.includes("image/*")) {
            chosen = item.input;
            break;
        }
    }

    logger.info(`content-publish yt sending image inputs=${imageInputs.length}`);
    await chosen.sendKeys(mediaPath);
    await contentPublishSleep(4000);
    await dismissCommunityIntro(driver);

    // Image editor may show Save Images or Save Preview.
    const saved = await clickByLabel(driver, ["^save images$", "^save preview$"]);
    logger.info(`content-publish yt save images/preview clicked=${saved}`);
    await contentPublishSleep(2000);

    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
        await dismissCommunityIntro(driver);
        const ready = await driver.executeScript(`
          const text = String(document.body?.innerText || "");
          const editable = [...document.querySelectorAll("#contenteditable-root, [contenteditable='true']")]
            .some((el) => el.getClientRects().length > 0);
          const writeBox = !!document.querySelector(
            "#contenteditable-root[aria-label='Write a message...'], [aria-label='Write a message...']"
          );
          return writeBox
            || editable
            || /edit preview|drag to reorder|reposition images|save images|write a message|delete/i.test(text);
        `);
        if (ready) {
            // Ensure Save is completed if still showing.
            await clickByLabel(driver, ["^save images$", "^save preview$"]);
            await contentPublishSleep(1000);
            logger.info("content-publish yt image preview ready");
            return;
        }
        await contentPublishSleep(700);
    }
    await failStep(driver, "YouTube step3 image preview missing", "yt-step3");
}

async function typeCaption(driver, title, description) {
    const text = [title, description].filter(Boolean).join("\n\n").trim();
    if (!text) {
        return;
    }

    await driver.executeScript(`
      const box = [...document.querySelectorAll(
        "#contenteditable-root, [contenteditable='true']"
      )].find((el) => {
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();
        // Prefer the community caption box; skip hidden poll/quiz fields when possible.
        return el.id === "contenteditable-root"
          || /message|share|photo|caption|post/i.test(aria)
          || el.getClientRects().length > 0;
      }) || [...document.querySelectorAll("#contenteditable-root, [contenteditable='true']")][0];
      if (box) {
        box.scrollIntoView({ block: "center" });
        box.focus();
        box.click();
      }
    `);
    await contentPublishSleep(400);

    const boxes = await driver.findElements({
        css: "#contenteditable-root, [contenteditable='true']",
    });
    let box = null;
    for (const candidate of boxes) {
        const aria = String((await candidate.getAttribute("aria-label")) || "").toLowerCase();
        const id = String((await candidate.getAttribute("id")) || "");
        if (id === "contenteditable-root" || /message|share|photo|caption|post/i.test(aria)) {
            box = candidate;
            break;
        }
    }
    box = box || boxes[0];
    if (!box) {
        await failStep(driver, "YouTube step4 caption box missing", "yt-step4");
    }

    try {
        await driver.actions({ async: true }).move({ origin: box }).click().perform();
    } catch {
        await box.click();
    }
    await contentPublishSleep(250);

    const active = await driver.switchTo().activeElement();
    await active.sendKeys(Key.chord(Key.CONTROL, "a"));
    await active.sendKeys(Key.BACK_SPACE);
    await active.sendKeys(text);
    await contentPublishSleep(900);

    const applied = await driver.executeScript(`
      const el = document.querySelector("#contenteditable-root")
        || document.querySelector("[contenteditable='true']");
      return String(el?.innerText || "").trim();
    `);
    const probe = text.slice(0, Math.min(12, text.length));
    if (!String(applied || "").includes(probe)) {
        await failStep(
            driver,
            `YouTube step4 caption not applied (ui=${JSON.stringify(applied)})`,
            "yt-step4",
        );
    }
}

async function clickPost(driver) {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
        await dismissCommunityIntro(driver);
        const posted = await driver.executeScript(`
          const nodes = [...document.querySelectorAll("button, yt-button-shape button")];
          const el = nodes.find((node) => {
            const aria = (node.getAttribute("aria-label") || "").trim();
            const text = (node.innerText || "").replace(/\\s+/g, " ").trim();
            const disabled = node.disabled || node.getAttribute("aria-disabled") === "true";
            return (/^post$/i.test(aria) || /^post$/i.test(text)) && !disabled;
          });
          if (!el) return false;
          el.scrollIntoView({ block: "center" });
          el.click();
          return true;
        `);
        if (posted) {
            await contentPublishSleep(5000);
            return;
        }
        await contentPublishSleep(700);
    }
    await failStep(driver, "YouTube step5 Post button missing/disabled", "yt-step5");
}

export async function publishYoutubeCommunityImagePost({
    driver,
    mediaPath,
    title,
    description,
    channelId = null,
}) {
    const resolvedChannelId = normalizeChannelId(channelId);
    if (!resolvedChannelId) {
        throw new Error(
            "YouTube channel id is required (UC…). Set it on the automation user / publish form.",
        );
    }

    logger.info(`content-publish yt publish start channel=${resolvedChannelId}`);
    await openCreatePostDialog(driver, resolvedChannelId);
    await assertChannelContext(driver, resolvedChannelId, "yt-before-compose");
    logger.info("content-publish yt compose ready, attaching image");
    await attachImage(driver, mediaPath);
    await assertChannelContext(driver, resolvedChannelId, "yt-after-image");
    logger.info("content-publish yt typing caption");
    await typeCaption(driver, title, description);
    logger.info("content-publish yt clicking Post");
    await clickPost(driver);
    logger.info(`content-publish yt publish ok channel=${resolvedChannelId}`);
}
