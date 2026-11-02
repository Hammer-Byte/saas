import { Key } from "selenium-webdriver";
import { contentPublishSleep, openUrl } from "../content_publish_browser.js";

/**
 * Instagram feed image post — live-tuned.
 *
 * Flow:
 * 1. Home → svg[aria-label=New post]
 * 2. Choose Post if create menu appears
 * 3. input[type=file] sendKeys(image)
 * 4. Dismiss notifications interstitial if shown
 * 5. Next through crop/filter
 * 6. Caption in [aria-label='Add a caption...'] via sendKeys
 * 7. Share
 */

const PAGE_HELPERS = `
function normalize(text) {
  return String(text || "").replace(/\\s+/g, " ").trim();
}

function findNewPostControl() {
  const svg = document.querySelector("svg[aria-label='New post']");
  if (!svg) return null;
  return svg.closest("a, div[role='button'], button, div") || svg;
}

function findPostMenuItem() {
  return [...document.querySelectorAll("button, div[role='button'], span, div")].find((el) =>
    normalize(el.innerText) === "Post"
  ) || null;
}

function findSelectFromComputer() {
  return [...document.querySelectorAll("button, div[role='button']")].find((el) =>
    /select from computer|select files/i.test(normalize(el.innerText))
  ) || null;
}

function findNotNow() {
  return [...document.querySelectorAll("button, div[role='button']")].find((el) =>
    /^not now$/i.test(normalize(el.innerText))
  ) || null;
}

function findNext() {
  return [...document.querySelectorAll("div[role='button'], button")].find((el) =>
    /^next$/i.test(normalize(el.innerText))
  ) || null;
}

function findShare() {
  return [...document.querySelectorAll("div[role='button'], button")].find((el) =>
    /^share$/i.test(normalize(el.innerText))
  ) || null;
}

function findCaption() {
  return document.querySelector("div[aria-label='Add a caption...'][contenteditable='true']")
    || document.querySelector("div[role='textbox'][aria-label*='caption' i]")
    || document.querySelector("textarea[aria-label*='caption' i]")
    || document.querySelector("div[aria-label*='Add a caption' i]")
    || null;
}
`;

export async function diagnoseInstagramPublish(driver) {
    return await driver.executeScript(`
      ${PAGE_HELPERS}
      return {
        url: location.href,
        newPost: !!findNewPostControl(),
        fileInputs: document.querySelectorAll("input[type='file']").length,
        next: !!findNext(),
        share: !!findShare(),
        caption: !!findCaption(),
        notNow: !!findNotNow(),
        dialogs: document.querySelectorAll("div[role='dialog']").length,
      };
    `);
}

async function dismissNotNow(driver) {
    await driver.executeScript(`
      ${PAGE_HELPERS}
      const notNow = findNotNow();
      if (notNow) notNow.click();
    `);
    await contentPublishSleep(800);
}

async function openCreatePost(driver) {
    const opened = await driver.executeScript(`
      ${PAGE_HELPERS}
      const control = findNewPostControl();
      if (!control) return false;
      control.click();
      return true;
    `);
    if (!opened) {
        const state = await diagnoseInstagramPublish(driver);
        throw new Error(`Instagram step2 New post missing (${JSON.stringify(state)})`);
    }
    await contentPublishSleep(2000);

    // Create menu may list Post / Live video / Ad
    await driver.executeScript(`
      ${PAGE_HELPERS}
      const postItem = findPostMenuItem();
      if (!postItem) return false;
      const clickable = postItem.closest("button, div[role='button'], div[role='menuitem']") || postItem;
      clickable.click();
      return true;
    `);
    await contentPublishSleep(1200);
}

async function attachImage(driver, mediaPath) {
    let inputs = await driver.findElements({ css: "input[type=file]" });
    if (!inputs.length) {
        await driver.executeScript(`
          ${PAGE_HELPERS}
          const select = findSelectFromComputer();
          if (select) select.click();
        `);
        await contentPublishSleep(1000);
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline && !inputs.length) {
            inputs = await driver.findElements({ css: "input[type=file]" });
            if (!inputs.length) {
                await contentPublishSleep(300);
            }
        }
    }
    if (!inputs.length) {
        const state = await diagnoseInstagramPublish(driver);
        throw new Error(`Instagram step3 file input missing (${JSON.stringify(state)})`);
    }

    await inputs[0].sendKeys(mediaPath);
    await contentPublishSleep(2500);
    await dismissNotNow(driver);
}

async function clickThroughNext(driver) {
    for (let step = 0; step < 4; step += 1) {
        await dismissNotNow(driver);
        const advanced = await driver.executeScript(`
          ${PAGE_HELPERS}
          const next = findNext();
          if (!next) return false;
          next.click();
          return true;
        `);
        if (!advanced) {
            break;
        }
        await contentPublishSleep(1500);
    }
}

async function typeCaption(driver, caption, hashtags) {
    const text = [caption, hashtags].filter(Boolean).join("\n");
    const deadline = Date.now() + 20000;
    let ready = false;
    while (Date.now() < deadline) {
        await dismissNotNow(driver);
        ready = await driver.executeScript(`
          ${PAGE_HELPERS}
          const caption = findCaption();
          if (!caption) return false;
          caption.scrollIntoView({ block: "center" });
          caption.focus();
          caption.click();
          return true;
        `);
        if (ready) {
            break;
        }
        await contentPublishSleep(400);
    }
    if (!ready) {
        const state = await diagnoseInstagramPublish(driver);
        throw new Error(`Instagram step4 caption missing (${JSON.stringify(state)})`);
    }

    const editors = await driver.findElements({
        css: "div[aria-label='Add a caption...'][contenteditable='true'], div[aria-label*='Add a caption' i], textarea[aria-label*='caption' i], div[role='textbox'][contenteditable='true']",
    });
    const editor = editors[0];
    if (!editor) {
        throw new Error("Instagram step4 caption element missing");
    }
    await editor.click();
    await editor.sendKeys(Key.chord(Key.CONTROL, "a"));
    await editor.sendKeys(Key.BACK_SPACE);
    if (text) {
        await editor.sendKeys(text);
    }
    await contentPublishSleep(800);
}

async function clickShare(driver) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        await dismissNotNow(driver);
        const shared = await driver.executeScript(`
          ${PAGE_HELPERS}
          const share = findShare();
          if (!share) return false;
          share.click();
          return true;
        `);
        if (shared) {
            await contentPublishSleep(6000);
            return;
        }
        await contentPublishSleep(500);
    }
    const state = await diagnoseInstagramPublish(driver);
    throw new Error(`Instagram step5 Share missing (${JSON.stringify(state)})`);
}

export async function publishInstagramImagePost({ driver, mediaPath, caption, hashtags }) {
    await openUrl(driver, "https://www.instagram.com/");
    await contentPublishSleep(2500);
    await dismissNotNow(driver);

    await openCreatePost(driver);
    await attachImage(driver, mediaPath);
    await clickThroughNext(driver);
    await typeCaption(driver, caption, hashtags);
    await clickShare(driver);
}
