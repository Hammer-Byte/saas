import { Key } from "selenium-webdriver";
import { logger } from "@hammerbyte/utils";
import { contentPublishSleep, openUrl } from "../content_publish_browser.js";
import {
    attachScreenshotToError,
    captureContentPublishScreenshot,
} from "../content_publish_screenshot.js";

/**
 * YouTube Community image post — live-tuned.
 *
 * Must publish as the given channel (brand accounts), not the default/main channel.
 *
 * Flow:
 * 1. Switch context via Studio for /channel/{UC…}
 * 2. Open /channel/{UC…}/posts?show_create_dialog=1 (or Studio community create)
 * 3. Verify page is still that channel before composing
 * 4. Add image → caption → Post
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
    let screenshotFile = null;
    try {
        screenshotFile = await captureContentPublishScreenshot(driver, label);
    } catch {
        // keep original error
    }
    throw attachScreenshotToError(new Error(message), screenshotFile);
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

async function ensureCommunityEnabled(driver) {
    if (await clickByLabel(driver, ["^turn on my community$"])) {
        await contentPublishSleep(2000);
        await clickByLabel(driver, ["^visit community$", "^not now$"]);
        await contentPublishSleep(2000);
    }
    await dismissCommunityIntro(driver);
}

async function diagnoseChannelContext(driver, channelId) {
    return await driver.executeScript(
        `
      const wanted = String(arguments[0] || "");
      const href = String(location.href || "");
      const html = String(document.documentElement?.innerHTML || "");
      const text = String(document.body?.innerText || "").slice(0, 2500);
      const inUrl = wanted && href.includes(wanted);
      const inHtml = wanted && html.includes(wanted);
      return {
        url: href,
        inUrl,
        inHtml,
        matched: !!(inUrl || inHtml),
        hasCompose: !!(
          document.querySelector("button[aria-label='Add an image']")
          || document.querySelector("#contenteditable-root, [aria-label='Write a message...']")
          || [...document.querySelectorAll("button")].some((el) =>
            /^post$/i.test((el.innerText || "").trim())
          )
        ),
        snippet: text.slice(0, 180),
      };
    `,
        channelId,
    );
}

async function assertChannelContext(driver, channelId, label) {
    const state = await diagnoseChannelContext(driver, channelId);
    logger.info(
        `content-publish yt channel-check matched=${state.matched} inUrl=${state.inUrl} url=${state.url}`,
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

async function establishChannelContext(driver, channelId) {
    // Studio channel URL forces the signed-in session onto that brand channel.
    logger.info(`content-publish yt switch studio channel=${channelId}`);
    await openUrl(driver, `https://studio.youtube.com/channel/${channelId}`);
    await contentPublishSleep(3500);

    let state = await diagnoseChannelContext(driver, channelId);
    if (!state.matched) {
        // Fallback: channel switcher with next=Studio for that channel
        logger.info("content-publish yt studio switch missed, trying channel_switcher");
        await openUrl(
            driver,
            `https://www.youtube.com/channel_switcher?next=${encodeURIComponent(
                `/channel/${channelId}/posts`,
            )}`,
        );
        await contentPublishSleep(4000);

        // If switcher shows a list, click the entry that mentions this channel id / href.
        await driver.executeScript(
            `
          const wanted = String(arguments[0] || "");
          const links = [...document.querySelectorAll("a[href*='channel/'], ytd-account-item-renderer, tp-yt-paper-item")];
          const hit = links.find((el) => {
            const href = el.getAttribute?.("href") || el.querySelector?.("a")?.getAttribute("href") || "";
            const text = (el.innerText || "") + " " + href;
            return href.includes(wanted) || text.includes(wanted);
          });
          if (hit) {
            const clickable = hit.closest("a, ytd-account-item-renderer, tp-yt-paper-item") || hit;
            clickable.click();
            return true;
          }
          return false;
        `,
            channelId,
        );
        await contentPublishSleep(3500);
        state = await diagnoseChannelContext(driver, channelId);
    }

    if (!state.matched) {
        await failStep(
            driver,
            `YouTube could not switch to channel ${channelId} (${JSON.stringify(state)})`,
            "yt-channel-switch",
        );
    }
}

async function openCreateOnChannelPosts(driver, channelId) {
    const postsUrl = `https://www.youtube.com/channel/${channelId}/posts?show_create_dialog=1`;
    logger.info(`content-publish yt open posts create ${postsUrl}`);
    await openUrl(driver, postsUrl);
    await contentPublishSleep(4500);
    await ensureCommunityEnabled(driver);
    await dismissCommunityIntro(driver);
    return await diagnoseChannelContext(driver, channelId);
}

async function openCreateOnStudioCommunity(driver, channelId) {
    const studioUrl = `https://studio.youtube.com/channel/${channelId}/community`;
    logger.info(`content-publish yt open studio community ${studioUrl}`);
    await openUrl(driver, studioUrl);
    await contentPublishSleep(4000);
    await dismissCommunityIntro(driver);

    // Prefer an explicit create/post control on Studio community.
    const opened = await driver.executeScript(`
      const nodes = [...document.querySelectorAll("button, a, div[role='button'], yt-button-shape button")];
      const create = nodes.find((el) => {
        const label = ((el.getAttribute("aria-label") || "") + " " + (el.innerText || ""))
          .replace(/\\s+/g, " ")
          .trim();
        return /^(create|new post|create post)$/i.test(label)
          || /create (a )?post/i.test(label);
      });
      if (!create) return false;
      create.click();
      return true;
    `);
    if (opened) {
        await contentPublishSleep(3500);
    }
    await dismissCommunityIntro(driver);
    return await diagnoseChannelContext(driver, channelId);
}

async function waitForComposeReady(driver, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ready = await driver.executeScript(`
          return !!(
            document.querySelector("button[aria-label='Add an image']")
            || document.querySelector("#contenteditable-root, [aria-label='Write a message...']")
            || [...document.querySelectorAll("button")].some((el) =>
              /^post$/i.test((el.innerText || "").trim())
            )
          );
        `);
        if (ready) {
            return true;
        }
        await contentPublishSleep(700);
    }
    return false;
}

async function openCreatePostDialog(driver, channelId) {
    await establishChannelContext(driver, channelId);

    let state = await openCreateOnChannelPosts(driver, channelId);
    await assertChannelContext(driver, channelId, "yt-posts-channel");

    if (state.hasCompose || (await waitForComposeReady(driver, 8000))) {
        logger.info("content-publish yt compose ready on channel posts");
        return;
    }

    // Do NOT fall back to www.youtube.com Create — that uses the default/main channel.
    state = await openCreateOnStudioCommunity(driver, channelId);
    await assertChannelContext(driver, channelId, "yt-studio-channel");

    if (state.hasCompose || (await waitForComposeReady(driver, 12000))) {
        logger.info("content-publish yt compose ready on studio community");
        return;
    }

    await failStep(
        driver,
        `YouTube step2 create dialog missing for channel ${channelId} (${JSON.stringify(state)})`,
        "yt-step2",
    );
}

async function attachImage(driver, mediaPath) {
    await clickByLabel(driver, ["^add an image$"]);
    await contentPublishSleep(1000);

    const inputs = await driver.findElements({ css: "input[type=file]" });
    let chosen = null;
    for (const input of inputs) {
        const accept = (await input.getAttribute("accept")) || "";
        const className = (await input.getAttribute("class")) || "";
        if (/image\/\*/i.test(accept) || (/image/i.test(accept) && !/searchbox/i.test(className))) {
            chosen = input;
            if (/image\/\*/i.test(accept)) {
                break;
            }
        }
    }
    if (!chosen) {
        await failStep(driver, "YouTube step3 image file input missing", "yt-step3");
    }

    await chosen.sendKeys(mediaPath);
    await contentPublishSleep(4000);
    await dismissCommunityIntro(driver);
    await clickByLabel(driver, ["^save images$"]);
    await contentPublishSleep(1500);

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        await dismissCommunityIntro(driver);
        const ready = await driver.executeScript(`
          const text = String(document.body?.innerText || "");
          return /edit preview|delete|drag to reorder|write a message/i.test(text)
            || !!document.querySelector("[aria-label='Write a message...']");
        `);
        if (ready) {
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
        "#contenteditable-root, [aria-label='Write a message...'], [contenteditable='true']"
      )].find((el) => el.getClientRects().length > 0);
      if (box) {
        box.scrollIntoView({ block: "center" });
        box.focus();
        box.click();
      }
    `);
    await contentPublishSleep(300);

    const boxes = await driver.findElements({
        css: "#contenteditable-root, [aria-label='Write a message...'], [contenteditable='true']",
    });
    const box = boxes[0];
    if (!box) {
        await failStep(driver, "YouTube step4 caption box missing", "yt-step4");
    }

    try {
        await driver.actions({ async: true }).move({ origin: box }).click().perform();
    } catch {
        await box.click();
    }
    await contentPublishSleep(200);

    const active = await driver.switchTo().activeElement();
    await active.sendKeys(Key.chord(Key.CONTROL, "a"));
    await active.sendKeys(Key.BACK_SPACE);
    await active.sendKeys(text);
    await contentPublishSleep(800);

    const applied = await driver.executeScript(`
      const el = document.querySelector("#contenteditable-root, [aria-label='Write a message...']");
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
    const deadline = Date.now() + 20000;
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
    // Re-check right before composing so we never silently post as default channel.
    await assertChannelContext(driver, resolvedChannelId, "yt-before-compose");
    logger.info("content-publish yt compose ready, attaching image");
    await attachImage(driver, mediaPath);
    logger.info("content-publish yt typing caption");
    await typeCaption(driver, title, description);
    logger.info("content-publish yt clicking Post");
    await clickPost(driver);
    logger.info(`content-publish yt publish ok channel=${resolvedChannelId}`);
}
