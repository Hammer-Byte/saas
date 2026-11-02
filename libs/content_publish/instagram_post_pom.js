import { Key } from "selenium-webdriver";
import { contentPublishSleep, openUrl } from "../content_publish_browser.js";

/**
 * Instagram feed image post — live-tuned.
 *
 * Caption editor is Lexical; bulk textContent/execCommand does not submit.
 * Type via Selenium Actions character-by-character after focusing the caret.
 *
 * Flow:
 * 1. Home → New post → Post
 * 2. Upload image via input[type=file]
 * 3. Dismiss Not Now if shown
 * 4. Next through crop/filter
 * 5. Type caption into [aria-label='Add a caption...']
 * 6. Share (no post-publish verification)
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
  // Prefer items inside the create dialog so feed "Post" buttons are ignored.
  const scope = document.querySelector("div[role='dialog']") || document;
  return [...scope.querySelectorAll("button, div[role='button'], span, div")].find((el) =>
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
  const scope = document.querySelector("div[role='dialog']") || document;
  return [...scope.querySelectorAll("div[role='button'], button")].find((el) =>
    /^next$/i.test(normalize(el.innerText))
  ) || null;
}

function findShare() {
  const scope = document.querySelector("div[role='dialog']") || document;
  return [...scope.querySelectorAll("div[role='button'], button")].find((el) =>
    /^share$/i.test(normalize(el.innerText))
  ) || null;
}

function findCaption() {
  return document.querySelector("[aria-label='Add a caption...']")
    || document.querySelector("[aria-label*='Add a caption' i]")
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
        captionText: (findCaption()?.innerText || "").slice(0, 120),
        notNow: !!findNotNow(),
        dialogs: document.querySelectorAll("div[role='dialog']").length,
        dialogText: String((document.querySelector("div[role='dialog']") || {}).innerText || "").slice(0, 160),
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

    // Wait until crop/filter wizard shows Next (or caption is already available).
    const readyDeadline = Date.now() + 20000;
    while (Date.now() < readyDeadline) {
        await dismissNotNow(driver);
        const ready = await driver.executeScript(`
          ${PAGE_HELPERS}
          return !!(findNext() || findCaption() || findShare());
        `);
        if (ready) {
            return;
        }
        await contentPublishSleep(500);
    }
}

async function clickThroughNext(driver) {
    // After upload, crop/filter UI can lag. Wait for Next or caption; do not
    // treat a momentary missing Next as finished.
    const deadline = Date.now() + 45000;
    let nextClicks = 0;

    while (Date.now() < deadline) {
        await dismissNotNow(driver);
        const status = await driver.executeScript(`
          ${PAGE_HELPERS}
          if (findCaption()) return { status: "caption" };
          if (findShare()) return { status: "share" };
          const next = findNext();
          if (next) {
            next.click();
            return { status: "next" };
          }
          const dialogText = String((document.querySelector("div[role='dialog']") || {}).innerText || "");
          return {
            status: "wait",
            dialogs: document.querySelectorAll("div[role='dialog']").length,
            dialogText: dialogText.slice(0, 120),
            fileInputs: document.querySelectorAll("input[type='file']").length,
          };
        `);

        if (status?.status === "caption" || status?.status === "share") {
            return;
        }
        if (status?.status === "next") {
            nextClicks += 1;
            await contentPublishSleep(1500);
            continue;
        }
        await contentPublishSleep(700);
    }

    const state = await diagnoseInstagramPublish(driver);
    throw new Error(
        `Instagram step4 wizard stuck before caption (nextClicks=${nextClicks}, ${JSON.stringify(state)})`,
    );
}

async function typeCaption(driver, caption, hashtags) {
    const text = [caption, hashtags].filter(Boolean).join("\n");
    if (!text) {
        return;
    }

    // Caption screen should already be open from clickThroughNext; keep a short wait.
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        await dismissNotNow(driver);
        const ready = await driver.executeScript(`
          ${PAGE_HELPERS}
          return !!findCaption();
        `);
        if (ready) {
            break;
        }
        // One more Next if crop/filter is still showing.
        await driver.executeScript(`
          ${PAGE_HELPERS}
          const next = findNext();
          if (next) next.click();
        `);
        await contentPublishSleep(700);
    }

    const boxes = await driver.findElements({
        css: "[aria-label='Add a caption...'], [aria-label*='Add a caption' i]",
    });
    const box = boxes[0];
    if (!box) {
        const state = await diagnoseInstagramPublish(driver);
        throw new Error(`Instagram step4 caption missing (${JSON.stringify(state)})`);
    }

    const probe = text.slice(0, Math.min(10, text.length));
    let applied = "";

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        await driver.executeScript(`
          ${PAGE_HELPERS}
          const el = findCaption();
          if (!el) return;
          const paragraph = el.querySelector("p") || el;
          el.scrollIntoView({ block: "center" });
          el.focus();
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          range.collapse(true);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          paragraph.click();
        `);
        await contentPublishSleep(400);

        await driver.actions({ async: true }).click(box).pause(300).perform();
        const active = await driver.switchTo().activeElement();
        await active.sendKeys(Key.chord(Key.CONTROL, "a"));
        await active.sendKeys(Key.BACK_SPACE);
        await contentPublishSleep(200);

        // Lexical needs real key events; type relatively slowly.
        for (const character of text) {
            await active.sendKeys(character);
            await contentPublishSleep(25);
        }
        await contentPublishSleep(800);

        applied = await driver.executeScript(`
          ${PAGE_HELPERS}
          const el = findCaption();
          return el ? String(el.innerText || "").trim() : "";
        `);
        if (String(applied || "").includes(probe)) {
            break;
        }
    }

    if (!String(applied || "").includes(probe)) {
        throw new Error(
            `Instagram step4 caption not applied (ui=${JSON.stringify(applied)})`,
        );
    }

    await contentPublishSleep(400);
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
            await contentPublishSleep(3000);
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
    await dismissNotNow(driver);

    await openCreatePost(driver);
    await attachImage(driver, mediaPath);
    await clickThroughNext(driver);
    await typeCaption(driver, caption, hashtags);
    await clickShare(driver);
}
