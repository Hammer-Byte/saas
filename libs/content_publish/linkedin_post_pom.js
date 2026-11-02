import { contentPublishSleep, openUrl } from "../content_publish_browser.js";

/**
 * LinkedIn feed image post — selectors locked via live cookie simulation.
 *
 * Flow:
 * 1. Open /sharing/compose (or Start a post → compose)
 * 2. Wait for Media button and/or ProseMirror editor
 * 3. Click button[aria-label=Media] → input[type=file]
 * 4. sendKeys(image); optional Next
 * 5. Type caption into div.ProseMirror / role=textbox
 * 6. Click button Post
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
  return document.querySelector("div.ProseMirror[contenteditable='true']")
    || document.querySelector("div.tiptap[contenteditable='true']")
    || document.querySelector("div[role='textbox'][contenteditable='true']")
    || document.querySelector("div[contenteditable='true']")
    || null;
}

function findMediaButton() {
  return document.querySelector("button[aria-label='Media']") || null;
}

function findNextButton() {
  return [...document.querySelectorAll("button")].find((el) => {
    const label = normalize(el.getAttribute("aria-label") || el.innerText || "");
    const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
    return /^next$/i.test(label) && !disabled;
  }) || null;
}

function findPostButton() {
  return [...document.querySelectorAll("button")].find((el) => {
    const label = normalize(el.getAttribute("aria-label") || el.innerText || "");
    const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
    return /^post$/i.test(label) && !disabled;
  }) || null;
}
`;

export async function diagnoseLinkedinPublish(driver) {
    return await driver.executeScript(`
      ${PAGE_HELPERS}
      return {
        url: location.href,
        startPost: !!findStartPostControl(),
        composer: !!findComposer(),
        mediaButton: !!findMediaButton(),
        fileInput: !!document.querySelector("input[type='file']"),
        nextButton: !!findNextButton(),
        postButton: !!findPostButton(),
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
        const state = await diagnoseLinkedinPublish(driver);
        throw new Error(`LinkedIn step2 start-post missing (${JSON.stringify(state)})`);
    }
    await contentPublishSleep(2000);
}

async function waitForComposeReady(driver, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const state = await diagnoseLinkedinPublish(driver);
        const onCompose = /sharing\/compose/i.test(state.url);
        if (onCompose && (state.composer || state.mediaButton || state.postButton)) {
            return state;
        }
        await contentPublishSleep(500);
    }
    const state = await diagnoseLinkedinPublish(driver);
    throw new Error(`LinkedIn step2 compose not ready (${JSON.stringify(state)})`);
}

async function attachImage(driver, mediaPath) {
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
            const state = await diagnoseLinkedinPublish(driver);
            throw new Error(`LinkedIn step3 Media button missing (${JSON.stringify(state)})`);
        }
        await contentPublishSleep(1500);
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline && !inputs.length) {
            inputs = await driver.findElements({ css: "input[type=file]" });
            if (!inputs.length) {
                await contentPublishSleep(400);
            }
        }
    }

    if (!inputs.length) {
        const state = await diagnoseLinkedinPublish(driver);
        throw new Error(`LinkedIn step3 file input missing (${JSON.stringify(state)})`);
    }

    await inputs[0].sendKeys(mediaPath);
    await contentPublishSleep(3000);

    const nextClicked = await driver.executeScript(`
      ${PAGE_HELPERS}
      const next = findNextButton();
      if (!next) return false;
      next.click();
      return true;
    `);
    if (nextClicked) {
        await contentPublishSleep(2000);
    }
}

async function typeCaption(driver, caption) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        const typed = await driver.executeScript(
            `
          ${PAGE_HELPERS}
          const composer = findComposer();
          if (!composer) return false;
          composer.focus();
          composer.innerHTML = "";
          const text = String(arguments[0] || "");
          composer.textContent = text;
          composer.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
          return true;
        `,
            caption,
        );
        if (typed) {
            await contentPublishSleep(800);
            return;
        }
        await contentPublishSleep(500);
    }
    const state = await diagnoseLinkedinPublish(driver);
    throw new Error(`LinkedIn step4 caption editor missing (${JSON.stringify(state)})`);
}

async function clickPost(driver) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        const clicked = await driver.executeScript(`
          ${PAGE_HELPERS}
          const button = findPostButton();
          if (!button) return false;
          button.click();
          return true;
        `);
        if (clicked) {
            await contentPublishSleep(4000);
            return;
        }
        await contentPublishSleep(500);
    }
    const state = await diagnoseLinkedinPublish(driver);
    throw new Error(`LinkedIn step5 Post button missing (${JSON.stringify(state)})`);
}

export async function publishLinkedinImagePost({ driver, mediaPath, caption }) {
    await openUrl(driver, "https://www.linkedin.com/sharing/compose");
    await contentPublishSleep(2500);

    let state = await diagnoseLinkedinPublish(driver);
    if (!/sharing\/compose/i.test(state.url)) {
        await openUrl(driver, "https://www.linkedin.com/feed/");
        await contentPublishSleep(2500);
        state = await diagnoseLinkedinPublish(driver);
        if (!state.startPost) {
            throw new Error(`LinkedIn step1 feed not ready (${JSON.stringify(state)})`);
        }
        await clickStartPost(driver);
    }

    await waitForComposeReady(driver);
    await attachImage(driver, mediaPath);
    await typeCaption(driver, caption);
    await clickPost(driver);
}
