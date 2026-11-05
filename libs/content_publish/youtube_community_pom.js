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
 * Flow:
 * 1. Open /channel/{UC…}/posts?show_create_dialog=1
 * 2. Enable Community / dismiss intro if shown
 * 3. Add an image via input[type=file]
 * 4. Type title + description into Write a message…
 * 5. Post (no post-publish verification)
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

async function openCreatePostDialog(driver, channelId) {
    await openUrl(
        driver,
        `https://www.youtube.com/channel/${channelId}/posts?show_create_dialog=1`,
    );
    await contentPublishSleep(4500);
    await ensureCommunityEnabled(driver);
    await dismissCommunityIntro(driver);

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
        return;
    }

    // Fallback: home Create → Create post
    await openUrl(driver, "https://www.youtube.com/");
    await contentPublishSleep(2500);
    const createOpened = await driver.executeScript(`
      const create = [...document.querySelectorAll("button")].find((button) =>
        (button.getAttribute("aria-label") || "").trim() === "Create"
      );
      if (!create) return false;
      create.click();
      return true;
    `);
    if (!createOpened) {
        await failStep(driver, "YouTube step2 Create control missing", "yt-step2");
    }
    await contentPublishSleep(1500);

    const postOpened = await driver.executeScript(`
      const nodes = [...document.querySelectorAll("ytd-compact-link-renderer a, tp-yt-paper-item, a")];
      const link = nodes.find((node) => {
        const text = ((node.getAttribute("aria-label") || "") + " " + (node.innerText || ""))
          .replace(/\\s+/g, " ")
          .trim();
        const href = node.getAttribute("href") || "";
        return /^create post$/i.test(text) || /show_create_dialog=1/i.test(href);
      });
      if (!link) return false;
      link.click();
      return true;
    `);
    if (!postOpened) {
        await failStep(driver, "YouTube step2 Create post menu item missing", "yt-step2");
    }
    await contentPublishSleep(4000);
    await dismissCommunityIntro(driver);
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
            "YouTube channel id is required (UC…). Set youtube_channel_id on the automation user.",
        );
    }

    logger.info(`content-publish yt publish start channel=${resolvedChannelId}`);
    await openCreatePostDialog(driver, resolvedChannelId);
    logger.info("content-publish yt compose ready, attaching image");
    await attachImage(driver, mediaPath);
    logger.info("content-publish yt typing caption");
    await typeCaption(driver, title, description);
    logger.info("content-publish yt clicking Post");
    await clickPost(driver);
    logger.info("content-publish yt publish ok");
}
