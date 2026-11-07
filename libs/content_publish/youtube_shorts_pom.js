import { Key } from "selenium-webdriver";
import { logger } from "@hammerbyte/utils";
import { contentPublishSleep, openUrl } from "../content_publish_browser.js";
import { failWithScreenshot } from "../content_publish_screenshot.js";

/**
 * YouTube Shorts upload via Studio for a specific channel.
 *
 * Flow:
 * 1. Establish channel context in Studio
 * 2. Open Studio upload dialog
 * 3. Attach video file
 * 4. Set title + description
 * 5. Next through checks → Publish
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

async function failStep(driver, message, label = "yt-shorts-fail") {
    await failWithScreenshot(driver, message, label);
}

async function detectGoogleChallenge(driver) {
    return await driver.executeScript(`
      const text = String(document.body?.innerText || "");
      const html = String(document.documentElement?.innerHTML || "");
      const title = String(document.title || "");
      const hay = (text + "\\n" + title).slice(0, 8000);
      const verifyItsYou = /verify it'?s you/i.test(hay);
      const confirmItsYou = /confirm it'?s really you/i.test(hay);
      const accountRecovery = /account recovery|unusual activity|sign in to continue/i.test(hay);
      const captcha = /recaptcha|captcha/i.test(hay) || /recaptcha/i.test(html);
      if (verifyItsYou || confirmItsYou) {
        return "Google asked to Verify it's you (complete this once in a normal browser for the same account, then refresh the YouTube cookie)";
      }
      if (accountRecovery) {
        return "Google sign-in / account challenge blocked YouTube Studio";
      }
      if (captcha) {
        return "Google captcha blocked YouTube Studio";
      }
      return null;
    `);
}

async function failUnlessReady(driver, message, label) {
    const challenge = await detectGoogleChallenge(driver);
    if (challenge) {
        await failStep(driver, challenge, label);
    }
    await failStep(driver, message, label);
}

async function clickByLabel(driver, patterns) {
    return await driver.executeScript(
        `
      const patterns = arguments[0].map((source) => new RegExp(source, "i"));
      const nodes = [...document.querySelectorAll(
        "button, yt-button-shape button, a, tp-yt-paper-button, div[role='button'], yt-icon-button, ytcp-button"
      )];
      for (const pattern of patterns) {
        const el = nodes.find((node) => {
          const aria = (node.getAttribute("aria-label") || "").trim();
          const text = (node.innerText || "").replace(/\\s+/g, " ").trim();
          const disabled = node.disabled
            || node.getAttribute("aria-disabled") === "true"
            || node.getAttribute("disabled") != null;
          if (disabled) return false;
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

async function diagnoseUpload(driver, channelId) {
    return await driver.executeScript(
        `
      const wanted = String(arguments[0] || "");
      const href = String(location.href || "");
      const text = String(document.body?.innerText || "").slice(0, 4000);
      const fileInputs = [...document.querySelectorAll("input[type='file']")].map((input) =>
        (input.getAttribute("accept") || "").toLowerCase()
      );
      const titleBox = !!document.querySelector(
        "#textbox, #title-textarea #textbox, ytcp-social-suggestions-textbox #textbox, [aria-label*='Add a title' i], [aria-label*='Title' i]"
      );
      const hasNext = [...document.querySelectorAll("button, ytcp-button")].some((el) => {
        const label = ((el.getAttribute("aria-label") || "") + " " + (el.innerText || ""))
          .replace(/\\s+/g, " ").trim();
        return /^next$/i.test(label);
      });
      const hasPublish = [...document.querySelectorAll("button, ytcp-button")].some((el) => {
        const label = ((el.getAttribute("aria-label") || "") + " " + (el.innerText || ""))
          .replace(/\\s+/g, " ").trim();
        return /^(publish|done)$/i.test(label);
      });
      return {
        url: href,
        channelMatched: wanted ? href.includes(wanted) || document.documentElement.innerHTML.includes(wanted) : false,
        fileInputs,
        titleBox,
        hasNext,
        hasPublish,
        snippet: text.slice(0, 220),
      };
    `,
        channelId,
    );
}

async function establishChannelContext(driver, channelId) {
    logger.info(`content-publish yt-shorts switch studio channel=${channelId}`);
    await openUrl(driver, `https://studio.youtube.com/channel/${channelId}`);
    await contentPublishSleep(4000);

    let state = await diagnoseUpload(driver, channelId);
    if (state.channelMatched && /studio\.youtube\.com\/channel\//i.test(state.url)) {
        logger.info("content-publish yt-shorts studio channel context ok");
        return;
    }

    logger.info("content-publish yt-shorts opening channel_switcher");
    await openUrl(
        driver,
        `https://www.youtube.com/channel_switcher?next=${encodeURIComponent(
            `/`,
        )}`,
    );
    await contentPublishSleep(3500);
    await driver.executeScript(
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
      if (!hit) return false;
      (hit.querySelector("a") || hit).click();
      return true;
    `,
        channelId,
    );
    await contentPublishSleep(4000);
    await openUrl(driver, `https://studio.youtube.com/channel/${channelId}`);
    await contentPublishSleep(4000);
    state = await diagnoseUpload(driver, channelId);
    if (!state.channelMatched) {
        await failUnlessReady(
            driver,
            `YouTube Shorts could not switch to channel ${channelId} (${JSON.stringify(state)})`,
            "yt-shorts-channel",
        );
    }
}

async function openUploadDialog(driver, channelId) {
    const uploadUrl = `https://studio.youtube.com/channel/${channelId}/videos/upload?d=ud`;
    logger.info(`content-publish yt-shorts open upload ${uploadUrl}`);
    await openUrl(driver, uploadUrl);
    await contentPublishSleep(4500);

    let state = await diagnoseUpload(driver, channelId);
    if (state.fileInputs.length) {
        return;
    }

    const createClicked = await clickByLabel(driver, [
        "^create$",
        "^create content$",
    ]);
    logger.info(`content-publish yt-shorts create clicked=${createClicked}`);
    await contentPublishSleep(1500);
    const uploadClicked = await clickByLabel(driver, [
        "^upload videos$",
        "^upload video$",
        "^upload$",
    ]);
    logger.info(`content-publish yt-shorts upload menu clicked=${uploadClicked}`);
    await contentPublishSleep(3000);

    state = await diagnoseUpload(driver, channelId);
    if (!state.fileInputs.length) {
        await failUnlessReady(
            driver,
            `YouTube Shorts upload dialog missing (${JSON.stringify(state)})`,
            "yt-shorts-upload-ui",
        );
    }
}

async function attachVideo(driver, mediaPath) {
    const inputs = await driver.findElements({ css: "input[type=file]" });
    if (!inputs.length) {
        await failStep(driver, "YouTube Shorts file input missing", "yt-shorts-file");
    }

    let chosen = inputs[0];
    for (const input of inputs) {
        const accept = String((await input.getAttribute("accept")) || "").toLowerCase();
        if (
            accept.includes("video")
            || accept.includes("mp4")
            || accept.includes("*/*")
            || !accept
        ) {
            chosen = input;
            if (accept.includes("video")) {
                break;
            }
        }
    }

    logger.info(`content-publish yt-shorts sending video inputs=${inputs.length}`);
    await chosen.sendKeys(mediaPath);

    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
        const state = await diagnoseUpload(driver, "");
        if (state.titleBox || state.hasNext) {
            logger.info("content-publish yt-shorts details form ready");
            return;
        }
        await contentPublishSleep(1500);
    }
    const state = await diagnoseUpload(driver, "");
    await failUnlessReady(
        driver,
        `YouTube Shorts details form missing after upload (${JSON.stringify(state)})`,
        "yt-shorts-details",
    );
}

async function fillTitleAndDescription(driver, title, description) {
    const titleText = String(title || "").trim();
    const descriptionText = String(description || "");

    const titleFilled = await driver.executeScript(
        `
      const title = String(arguments[0] || "");
      const candidates = [
        ...document.querySelectorAll(
          "#title-textarea #textbox, ytcp-social-suggestions-textbox #textbox, #textbox, [aria-label*='Add a title' i], [aria-label*='Title (required)' i]"
        ),
      ].filter((el) => el.getClientRects().length > 0);
      const box = candidates[0];
      if (!box) return false;
      box.focus();
      box.click();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, title);
      box.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return true;
    `,
        titleText,
    );
    if (!titleFilled) {
        const editors = await driver.findElements({
            css: "#title-textarea #textbox, #textbox, [contenteditable='true']",
        });
        if (!editors.length) {
            await failUnlessReady(
                driver,
                "YouTube Shorts title box missing",
                "yt-shorts-title",
            );
        }
        const editor = editors[0];
        await editor.click();
        await editor.sendKeys(Key.chord(Key.CONTROL, "a"));
        await editor.sendKeys(Key.BACK_SPACE);
        await editor.sendKeys(titleText);
    }
    await contentPublishSleep(800);

    if (descriptionText) {
        await driver.executeScript(
            `
          const description = String(arguments[0] || "");
          const candidates = [
            ...document.querySelectorAll(
              "#description-textarea #textbox, [aria-label*='Tell viewers about' i], [aria-label*='Description' i]"
            ),
          ].filter((el) => el.getClientRects().length > 0);
          const box = candidates.find((el) => {
            const aria = (el.getAttribute("aria-label") || "").toLowerCase();
            return /description|tell viewers|about your video/.test(aria)
              || el.closest("#description-textarea");
          }) || candidates[1] || null;
          if (!box) return false;
          box.focus();
          box.click();
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, description);
          box.dispatchEvent(new InputEvent("input", { bubbles: true }));
          return true;
        `,
            descriptionText,
        );
        await contentPublishSleep(800);
    }
}

async function clickThroughToPublish(driver) {
    for (let step = 0; step < 5; step += 1) {
        const published = await clickByLabel(driver, ["^publish$", "^save$"]);
        if (published) {
            logger.info(`content-publish yt-shorts publish clicked step=${step}`);
            await contentPublishSleep(5000);
            return;
        }

        // Prefer Public if visibility radios appear.
        await driver.executeScript(`
          const radios = [...document.querySelectorAll(
            "tp-yt-paper-radio-button, [name='PUBLIC'], [name='VIDEO_MADE_FOR_KIDS'], div[role='radio']"
          )];
          const publicRadio = radios.find((el) => {
            const label = ((el.getAttribute("name") || "") + " " + (el.innerText || "") + " " + (el.getAttribute("aria-label") || ""))
              .replace(/\\s+/g, " ").trim();
            return /public/i.test(label) && !/not made for kids|made for kids/i.test(label);
          });
          if (publicRadio) publicRadio.click();
          const notForKids = [...document.querySelectorAll(
            "tp-yt-paper-radio-button, div[role='radio'], label"
          )].find((el) => {
            const label = ((el.getAttribute("name") || "") + " " + (el.innerText || "") + " " + (el.getAttribute("aria-label") || ""))
              .replace(/\\s+/g, " ").trim();
            return /no[, ]? it'?s not made for kids|not made for kids/i.test(label);
          });
          if (notForKids) notForKids.click();
        `);
        await contentPublishSleep(500);

        const next = await clickByLabel(driver, ["^next$"]);
        logger.info(`content-publish yt-shorts next clicked=${next} step=${step}`);
        if (!next) {
            break;
        }
        await contentPublishSleep(2000);
    }

    const done = await clickByLabel(driver, ["^publish$", "^done$", "^save$"]);
    if (!done) {
        const state = await diagnoseUpload(driver, "");
        await failUnlessReady(
            driver,
            `YouTube Shorts publish control missing (${JSON.stringify(state)})`,
            "yt-shorts-publish",
        );
    }
    await contentPublishSleep(5000);
}

export async function publishYoutubeShort({
    driver,
    mediaPath,
    title,
    description = "",
    channelId = null,
}) {
    const resolvedChannelId = normalizeChannelId(channelId);
    if (!resolvedChannelId) {
        throw new Error("YouTube channel id is required for Shorts upload");
    }
    if (!String(title || "").trim()) {
        throw new Error("YouTube Shorts title is required");
    }

    logger.info(`content-publish yt-shorts publish start channel=${resolvedChannelId}`);
    await establishChannelContext(driver, resolvedChannelId);
    await openUploadDialog(driver, resolvedChannelId);
    await attachVideo(driver, mediaPath);
    logger.info("content-publish yt-shorts filling title/description");
    await fillTitleAndDescription(driver, title, description);
    logger.info("content-publish yt-shorts advancing to publish");
    await clickThroughToPublish(driver);
    logger.info("content-publish yt-shorts publish ok");
}
