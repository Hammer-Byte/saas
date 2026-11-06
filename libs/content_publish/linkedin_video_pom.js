import { Key } from "selenium-webdriver";
import { logger } from "@hammerbyte/utils";
import { contentPublishSleep, openUrl } from "../content_publish_browser.js";
import { failWithScreenshot } from "../content_publish_screenshot.js";

/**
 * LinkedIn feed video post — same compose entry as image posts.
 *
 * Personal: /sharing/compose
 * Company Page: /company/{id}/admin/page-posts/published/?share=true
 */

const PAGE_HELPERS = `
function normalize(text) {
  return String(text || "").replace(/\\s+/g, " ").trim();
}

function findStartPostControl() {
  return [...document.querySelectorAll("div[role='button']")].find((el) => {
    const aria = normalize(el.getAttribute("aria-label"));
    const text = normalize(el.innerText);
    return aria === "Start a post" || text === "Start a post";
  }) || null;
}

function findComposer() {
  const dialog = document.querySelector("div[role='dialog']");
  const scope = dialog || document;
  return scope.querySelector("div.ProseMirror[contenteditable='true']")
    || scope.querySelector("div.tiptap[contenteditable='true']")
    || scope.querySelector("div[role='textbox'][contenteditable='true']")
    || scope.querySelector("div[contenteditable='true']")
    || null;
}

function findMediaButton() {
  const dialog = document.querySelector("div[role='dialog']");
  const scope = dialog || document;
  return scope.querySelector("button[aria-label='Media']")
    || scope.querySelector("button[aria-label='Add media']")
    || [...scope.querySelectorAll("button")].find((el) => {
      const label = normalize(el.getAttribute("aria-label") || el.innerText || "");
      return /^(media|add media)$/i.test(label);
    })
    || null;
}

function findUploadFromComputer() {
  const nodes = [...document.querySelectorAll("button, div[role='button'], div[role='menuitem'], span, div")];
  const upload = nodes.find((el) => normalize(el.innerText) === "Upload from computer");
  if (!upload) return null;
  return upload.closest("button, div[role='button'], div[role='menuitem']") || upload;
}

function findNextButton() {
  return [...document.querySelectorAll("button")].find((el) => {
    const label = normalize(el.getAttribute("aria-label") || el.innerText || "");
    const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
    return /^next$/i.test(label) && !disabled;
  }) || null;
}

function findDoneButton() {
  return [...document.querySelectorAll("button")].find((el) => {
    const label = normalize(el.getAttribute("aria-label") || el.innerText || "");
    const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
    return /^done$/i.test(label) && !disabled;
  }) || null;
}

function findPostButton() {
  const dialog = document.querySelector("div[role='dialog']");
  const scope = dialog || document;
  return [...scope.querySelectorAll("button")].find((el) => {
    const label = normalize(el.getAttribute("aria-label") || el.innerText || "");
    const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
    return /^post$/i.test(label) && !disabled;
  }) || null;
}

function countVideoPreviews() {
  const videos = [...document.querySelectorAll("video")].filter((video) => {
    const src = video.currentSrc || video.src || "";
    return video.getClientRects().length > 0
      || src.startsWith("blob:")
      || src.startsWith("data:");
  }).length;
  const thumbs = [...document.querySelectorAll("img")].filter((img) => {
    const src = img.currentSrc || img.src || "";
    const alt = String(img.alt || "");
    if (img.naturalWidth <= 40) return false;
    return src.startsWith("blob:")
      || /preview|video|thumbnail/i.test(alt);
  }).length;
  return videos + thumbs;
}

function mediaEditorReady() {
  const dialog = document.querySelector("div[role='dialog']");
  const text = normalize(dialog?.innerText || document.body?.innerText || "");
  if (/processing|uploading|still working/i.test(text) && countVideoPreviews() === 0) {
    return false;
  }
  return /\\b1 of 1\\b/i.test(text)
    || /alternative text|edit video|video details|thumbnail/i.test(text)
    || countVideoPreviews() > 0;
}

function composeAuthorHint() {
  const dialog = document.querySelector("div[role='dialog']");
  return normalize(dialog?.innerText || "").slice(0, 160);
}
`;

function normalizeCompanyId(value) {
    const text = String(value || "").trim();
    if (!text) {
        return "";
    }
    const fromAdmin = text.match(/company\/(\d+)(?:\/|$)/i);
    if (fromAdmin) {
        return fromAdmin[1];
    }
    if (/^\d+$/.test(text)) {
        return text;
    }
    return "";
}

async function failStep(driver, message, label = "li-video-fail") {
    await failWithScreenshot(driver, message, label);
}

async function diagnoseLinkedinVideoPublish(driver) {
    return await driver.executeScript(`
      ${PAGE_HELPERS}
      return {
        url: location.href,
        startPost: !!findStartPostControl(),
        composer: !!findComposer(),
        mediaButton: !!findMediaButton(),
        uploadFromComputer: !!findUploadFromComputer(),
        fileInput: !!document.querySelector("input[type='file']"),
        videoPreviews: countVideoPreviews(),
        mediaEditor: mediaEditorReady(),
        nextButton: !!findNextButton(),
        doneButton: !!findDoneButton(),
        postButton: !!findPostButton(),
        caption: (findComposer()?.innerText || "").slice(0, 120),
        authorHint: composeAuthorHint(),
      };
    `);
}

async function clickStartPost(driver) {
    const clicked = await driver.executeScript(`
      ${PAGE_HELPERS}
      const control = findStartPostControl();
      if (!control) return false;
      control.click();
      return true;
    `);
    if (!clicked) {
        const state = await diagnoseLinkedinVideoPublish(driver);
        await failStep(
            driver,
            `LinkedIn video step2 start-post missing (${JSON.stringify(state)})`,
            "li-video-start",
        );
    }
    await contentPublishSleep(2000);
}

async function waitForComposeReady(driver, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const state = await diagnoseLinkedinVideoPublish(driver);
        const onCompose =
            /sharing\/compose|share=true|page-posts/i.test(state.url)
            || state.composer
            || state.mediaButton
            || state.postButton;
        if (onCompose && (state.composer || state.mediaButton || state.postButton)) {
            return state;
        }
        await contentPublishSleep(500);
    }
    const state = await diagnoseLinkedinVideoPublish(driver);
    await failStep(
        driver,
        `LinkedIn video step2 compose not ready (${JSON.stringify(state)})`,
        "li-video-compose",
    );
}

async function waitForFileInputs(driver, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let inputs = [];
    while (Date.now() < deadline) {
        inputs = await driver.findElements({ css: "input[type=file]" });
        if (inputs.length) {
            return inputs;
        }
        await contentPublishSleep(300);
    }
    return inputs;
}

async function attachVideo(driver, mediaPath) {
    let inputs = await driver.findElements({ css: "input[type=file]" });

    if (!inputs.length) {
        const clickedMedia = await driver.executeScript(`
          ${PAGE_HELPERS}
          const mediaButton = findMediaButton();
          if (!mediaButton) return false;
          mediaButton.click();
          return true;
        `);
        if (!clickedMedia) {
            const state = await diagnoseLinkedinVideoPublish(driver);
            await failStep(
                driver,
                `LinkedIn video step3 Media button missing (${JSON.stringify(state)})`,
                "li-video-media",
            );
        }
        await contentPublishSleep(1000);
        inputs = await waitForFileInputs(driver, 4000);

        if (!inputs.length) {
            const clickedUpload = await driver.executeScript(`
              ${PAGE_HELPERS}
              const upload = findUploadFromComputer();
              if (!upload) return false;
              upload.click();
              return true;
            `);
            if (!clickedUpload) {
                const state = await diagnoseLinkedinVideoPublish(driver);
                await failStep(
                    driver,
                    `LinkedIn video step3 upload control missing (${JSON.stringify(state)})`,
                    "li-video-upload",
                );
            }
            await contentPublishSleep(1000);
            inputs = await waitForFileInputs(driver, 15000);
        }
    }

    if (!inputs.length) {
        const state = await diagnoseLinkedinVideoPublish(driver);
        await failStep(
            driver,
            `LinkedIn video step3 file input missing (${JSON.stringify(state)})`,
            "li-video-file",
        );
    }

    let chosen = inputs[0];
    for (const input of inputs) {
        const accept = String((await input.getAttribute("accept")) || "").toLowerCase();
        if (
            accept.includes("video")
            || accept.includes("mp4")
            || accept.includes("mov")
            || accept.includes("*/*")
            || !accept
        ) {
            chosen = input;
            if (accept.includes("video") || accept.includes("mp4")) {
                break;
            }
        }
    }

    await chosen.sendKeys(mediaPath);

    const previewDeadline = Date.now() + 180000;
    let previewReady = false;
    while (Date.now() < previewDeadline) {
        const ready = await driver.executeScript(`
          ${PAGE_HELPERS}
          return mediaEditorReady();
        `);
        if (ready) {
            previewReady = true;
            break;
        }
        await contentPublishSleep(1000);
    }
    if (!previewReady) {
        const state = await diagnoseLinkedinVideoPublish(driver);
        await failStep(
            driver,
            `LinkedIn video step3 preview missing (${JSON.stringify(state)})`,
            "li-video-preview",
        );
    }

    await contentPublishSleep(1500);

    const nextClicked = await driver.executeScript(`
      ${PAGE_HELPERS}
      const next = findNextButton();
      if (!next) return false;
      next.click();
      return true;
    `);
    if (nextClicked) {
        await contentPublishSleep(2500);
    }

    const doneClicked = await driver.executeScript(`
      ${PAGE_HELPERS}
      const done = findDoneButton();
      if (!done) return false;
      done.click();
      return true;
    `);
    if (doneClicked) {
        await contentPublishSleep(2000);
    }
}

async function typeCaption(driver, caption) {
    const text = String(caption || "");
    const deadline = Date.now() + 20000;
    let editor = null;

    while (Date.now() < deadline) {
        const found = await driver.executeScript(`
          ${PAGE_HELPERS}
          const composer = findComposer();
          if (!composer) return false;
          composer.scrollIntoView({ block: "center" });
          composer.focus();
          composer.click();
          return true;
        `);
        if (found) {
            const editors = await driver.findElements({
                css: "div[role='dialog'] div[contenteditable='true'], div[contenteditable='true']",
            });
            editor = editors[0] || null;
            if (editor) {
                break;
            }
        }
        await contentPublishSleep(400);
    }

    if (!editor) {
        const state = await diagnoseLinkedinVideoPublish(driver);
        await failStep(
            driver,
            `LinkedIn video step4 caption editor missing (${JSON.stringify(state)})`,
            "li-video-caption",
        );
    }

    await editor.click();
    await editor.sendKeys(Key.chord(Key.CONTROL, "a"));
    await editor.sendKeys(Key.BACK_SPACE);
    if (text) {
        await editor.sendKeys(text);
    }
    await contentPublishSleep(800);

    const applied = await driver.executeScript(`
      ${PAGE_HELPERS}
      const composer = findComposer();
      return composer ? String(composer.innerText || "").trim() : "";
    `);
    if (text && !String(applied || "").includes(text.slice(0, Math.min(12, text.length)))) {
        await driver.executeScript(
            `
          ${PAGE_HELPERS}
          const composer = findComposer();
          if (!composer) return false;
          composer.focus();
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, String(arguments[0] || ""));
          composer.dispatchEvent(new InputEvent("input", { bubbles: true }));
          return true;
        `,
            text,
        );
        await contentPublishSleep(500);
    }
}

async function clickPost(driver) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const clicked = await driver.executeScript(`
          ${PAGE_HELPERS}
          const button = findPostButton();
          if (!button) return false;
          button.click();
          return true;
        `);
        if (clicked) {
            await contentPublishSleep(6000);
            return;
        }
        await contentPublishSleep(500);
    }
    const state = await diagnoseLinkedinVideoPublish(driver);
    await failStep(
        driver,
        `LinkedIn video step5 Post button missing (${JSON.stringify(state)})`,
        "li-video-post",
    );
}

async function openPersonalCompose(driver) {
    await openUrl(driver, "https://www.linkedin.com/sharing/compose");
    await contentPublishSleep(2500);

    let state = await diagnoseLinkedinVideoPublish(driver);
    if (!/sharing\/compose/i.test(state.url) && !state.composer) {
        await openUrl(driver, "https://www.linkedin.com/feed/");
        await contentPublishSleep(2500);
        state = await diagnoseLinkedinVideoPublish(driver);
        if (!state.startPost) {
            await failStep(
                driver,
                `LinkedIn video step1 feed not ready (${JSON.stringify(state)})`,
                "li-video-feed",
            );
        }
        await clickStartPost(driver);
    }
}

async function openPageCompose(driver, companyId) {
    await openUrl(
        driver,
        `https://www.linkedin.com/company/${companyId}/admin/page-posts/published/?share=true`,
    );
    await contentPublishSleep(3500);

    let state = await diagnoseLinkedinVideoPublish(driver);
    if (state.composer || state.mediaButton || state.postButton) {
        return;
    }

    await openUrl(
        driver,
        `https://www.linkedin.com/company/${companyId}/admin/page-posts/published/`,
    );
    await contentPublishSleep(3000);
    const opened = await driver.executeScript(`
      ${PAGE_HELPERS}
      const nodes = [...document.querySelectorAll("button, a, div[role='button']")];
      const start = nodes.find((el) => {
        const label = normalize((el.getAttribute("aria-label") || "") + " " + (el.innerText || ""));
        return /^start a post$/i.test(label);
      });
      const create = nodes.find((el) => {
        const label = normalize((el.getAttribute("aria-label") || "") + " " + (el.innerText || ""));
        return /^create$/i.test(label);
      });
      const target = start || create;
      if (!target) return false;
      target.click();
      return true;
    `);
    if (!opened) {
        state = await diagnoseLinkedinVideoPublish(driver);
        await failStep(
            driver,
            `LinkedIn video step1 page compose missing (${JSON.stringify(state)})`,
            "li-video-page",
        );
    }
    await contentPublishSleep(2500);
}

export async function publishLinkedinVideoPost({
    driver,
    mediaPath,
    caption,
    companyId = null,
}) {
    const resolvedCompanyId = normalizeCompanyId(companyId);
    logger.info(
        `content-publish li video publish start company=${resolvedCompanyId || "personal"}`,
    );
    if (resolvedCompanyId) {
        logger.info(`content-publish li video open page compose company=${resolvedCompanyId}`);
        await openPageCompose(driver, resolvedCompanyId);
    } else {
        logger.info("content-publish li video open personal compose");
        await openPersonalCompose(driver);
    }

    await waitForComposeReady(driver);
    logger.info("content-publish li video compose ready, attaching video");
    await attachVideo(driver, mediaPath);
    logger.info("content-publish li video typing caption");
    await typeCaption(driver, caption);
    logger.info("content-publish li video clicking Post");
    await clickPost(driver);
    logger.info("content-publish li video publish ok");
}
