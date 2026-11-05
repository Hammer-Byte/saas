import { Key } from "selenium-webdriver";
import { contentPublishSleep, openUrl } from "../content_publish_browser.js";
import {
    attachScreenshotToError,
    captureContentPublishScreenshot,
} from "../content_publish_screenshot.js";

/**
 * Instagram feed image post — human-paced + step screenshots for debugging.
 *
 * Caption editor is Lexical; bulk textContent/execCommand does not submit.
 * Type via Selenium Actions character-by-character after focusing the caret.
 *
 * Flow:
 * 1. Home → New post → Post
 * 2. Upload image via input[type=file]
 * 3. Dismiss Not Now if shown
 * 4. Next through crop/filter (pause like a person reviewing each screen)
 * 5. Type caption slowly into [aria-label='Add a caption...']
 * 6. Pause, then Share
 */

const PAGE_HELPERS = `
function normalize(text) {
  return String(text || "").replace(/\\s+/g, " ").trim();
}

function buttonLabel(el) {
  return normalize(el.innerText) || normalize(el.getAttribute("aria-label"));
}

function findCreateDialog() {
  const dialogs = [...document.querySelectorAll("div[role='dialog']")];
  if (!dialogs.length) return null;
  const scored = dialogs.map((dialog, index) => {
    const text = normalize(dialog.innerText);
    let score = text.length;
    if (/create new post|crop|edit|filters|share|caption|select from computer|add a caption/i.test(text)) {
      score += 1000;
    }
    if (dialog.querySelector("[aria-label='Add a caption...'], [aria-label*='Add a caption' i]")) {
      score += 2000;
    }
    if ([...dialog.querySelectorAll("div[role='button'], button")].some((el) =>
      /^(next|share)$/i.test(buttonLabel(el))
    )) {
      score += 500;
    }
    score += index;
    return { dialog, score, textLength: text.length };
  });
  scored.sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (best.textLength > 0 || best.score >= 500) {
    return best.dialog;
  }
  const withText = scored.find((item) => item.textLength > 0);
  return withText ? withText.dialog : dialogs[dialogs.length - 1];
}

function findNewPostControl() {
  const svg = document.querySelector("svg[aria-label='New post']");
  if (!svg) return null;
  return svg.closest("a, div[role='button'], button, div") || svg;
}

function findPostMenuItem() {
  const scope = findCreateDialog() || document;
  return [...scope.querySelectorAll("button, div[role='button'], span, div")].find((el) =>
    normalize(el.innerText) === "Post"
  ) || null;
}

function findSelectFromComputer() {
  const scope = findCreateDialog() || document;
  return [...scope.querySelectorAll("button, div[role='button']")].find((el) =>
    /select from computer|select files/i.test(normalize(el.innerText))
  ) || null;
}

function findNotNow() {
  return [...document.querySelectorAll("button, div[role='button']")].find((el) =>
    /^not now$/i.test(normalize(el.innerText))
  ) || null;
}

function findNext() {
  const scopes = [findCreateDialog(), document].filter(Boolean);
  for (const scope of scopes) {
    const next = [...scope.querySelectorAll("div[role='button'], button")].find((el) => {
      const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
      return /^next$/i.test(buttonLabel(el)) && !disabled;
    });
    if (next) return next;
  }
  return null;
}

function findShare() {
  const scopes = [findCreateDialog(), document].filter(Boolean);
  for (const scope of scopes) {
    const share = [...scope.querySelectorAll("div[role='button'], button")].find((el) => {
      const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
      return /^share$/i.test(buttonLabel(el)) && !disabled;
    });
    if (share) return share;
  }
  return null;
}

function findCaption() {
  const scope = findCreateDialog() || document;
  return scope.querySelector("[aria-label='Add a caption...']")
    || scope.querySelector("[aria-label*='Add a caption' i]")
    || document.querySelector("[aria-label='Add a caption...']")
    || document.querySelector("[aria-label*='Add a caption' i]")
    || null;
}
`;

function humanPause(minMs, maxMs = minMs) {
    const low = Math.max(0, Number(minMs) || 0);
    const high = Math.max(low, Number(maxMs) || low);
    const ms = low + Math.floor(Math.random() * (high - low + 1));
    return contentPublishSleep(ms);
}

async function debugShot(driver, label) {
    try {
        return await captureContentPublishScreenshot(driver, label);
    } catch {
        return null;
    }
}

async function failWithShot(driver, label, message) {
    const screenshotFile = await debugShot(driver, label);
    throw attachScreenshotToError(new Error(message), screenshotFile);
}

export async function diagnoseInstagramPublish(driver) {
    return await driver.executeScript(`
      ${PAGE_HELPERS}
      const dialog = findCreateDialog();
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
        dialogText: String((dialog || {}).innerText || "").slice(0, 160),
      };
    `);
}

async function dismissNotNow(driver) {
    const clicked = await driver.executeScript(`
      ${PAGE_HELPERS}
      const notNow = findNotNow();
      if (!notNow) return false;
      notNow.click();
      return true;
    `);
    if (clicked) {
        await humanPause(700, 1400);
    }
}

async function openCreatePost(driver) {
    await debugShot(driver, "ig-01-home");
    await humanPause(800, 1600);

    const opened = await driver.executeScript(`
      ${PAGE_HELPERS}
      const control = findNewPostControl();
      if (!control) return false;
      control.scrollIntoView({ block: "center" });
      control.click();
      return true;
    `);
    if (!opened) {
        const state = await diagnoseInstagramPublish(driver);
        await failWithShot(
            driver,
            "ig-02-new-post-missing",
            `Instagram step2 New post missing (${JSON.stringify(state)})`,
        );
    }
    await humanPause(1800, 3200);
    await debugShot(driver, "ig-02-after-new-post");

    const chosePost = await driver.executeScript(`
      ${PAGE_HELPERS}
      const postItem = findPostMenuItem();
      if (!postItem) return false;
      const clickable = postItem.closest("button, div[role='button'], div[role='menuitem']") || postItem;
      clickable.click();
      return true;
    `);
    if (!chosePost) {
        // Some accounts open the uploader directly without a Post submenu.
        const hasUpload = await driver.executeScript(`
          ${PAGE_HELPERS}
          return !!(findSelectFromComputer() || document.querySelector("input[type='file']"));
        `);
        if (!hasUpload) {
            const state = await diagnoseInstagramPublish(driver);
            await failWithShot(
                driver,
                "ig-02-post-menu-missing",
                `Instagram step2 Post menu missing (${JSON.stringify(state)})`,
            );
        }
    }
    await humanPause(1400, 2600);
    await debugShot(driver, "ig-02-create-dialog");
}

async function attachImage(driver, mediaPath) {
    let inputs = await driver.findElements({ css: "input[type=file]" });
    if (!inputs.length) {
        await humanPause(600, 1200);
        await driver.executeScript(`
          ${PAGE_HELPERS}
          const select = findSelectFromComputer();
          if (select) {
            select.scrollIntoView({ block: "center" });
            select.click();
          }
        `);
        await humanPause(900, 1600);
        const deadline = Date.now() + 12000;
        while (Date.now() < deadline && !inputs.length) {
            inputs = await driver.findElements({ css: "input[type=file]" });
            if (!inputs.length) {
                await humanPause(350, 700);
            }
        }
    }
    if (!inputs.length) {
        const state = await diagnoseInstagramPublish(driver);
        await failWithShot(
            driver,
            "ig-03-file-input-missing",
            `Instagram step3 file input missing (${JSON.stringify(state)})`,
        );
    }

    await debugShot(driver, "ig-03-before-upload");
    await humanPause(500, 1100);
    await inputs[0].sendKeys(mediaPath);

    // Let IG process the file like a person waiting for the preview.
    await humanPause(2800, 4500);
    await dismissNotNow(driver);
    await debugShot(driver, "ig-03-after-upload");

    const readyDeadline = Date.now() + 25000;
    while (Date.now() < readyDeadline) {
        await dismissNotNow(driver);
        const ready = await driver.executeScript(`
          ${PAGE_HELPERS}
          return !!(findNext() || findCaption() || findShare());
        `);
        if (ready) {
            await humanPause(900, 1800);
            await debugShot(driver, "ig-03-upload-ready");
            return;
        }
        await humanPause(600, 1100);
    }

    const state = await diagnoseInstagramPublish(driver);
    await failWithShot(
        driver,
        "ig-03-upload-not-ready",
        `Instagram step3 upload preview not ready (${JSON.stringify(state)})`,
    );
}

async function clickThroughNext(driver) {
    const deadline = Date.now() + 60000;
    let nextClicks = 0;

    while (Date.now() < deadline) {
        await dismissNotNow(driver);
        const status = await driver.executeScript(`
          ${PAGE_HELPERS}
          if (findCaption()) return { status: "caption" };
          if (findShare()) return { status: "share" };
          const dialog = findCreateDialog();
          const dialogText = String((dialog || {}).innerText || "").slice(0, 200);
          if (/something went wrong/i.test(dialogText)) {
            return {
              status: "ig_error",
              dialogs: document.querySelectorAll("div[role='dialog']").length,
              dialogText,
              fileInputs: document.querySelectorAll("input[type='file']").length,
            };
          }
          const next = findNext();
          if (!next) {
            return {
              status: "wait",
              dialogs: document.querySelectorAll("div[role='dialog']").length,
              dialogText,
              fileInputs: document.querySelectorAll("input[type='file']").length,
            };
          }
          next.scrollIntoView({ block: "center" });
          next.click();
          return { status: "next", dialogText };
        `);

        if (status?.status === "caption" || status?.status === "share") {
            await humanPause(1000, 2000);
            await debugShot(driver, "ig-04-caption-screen");
            return;
        }
        if (status?.status === "ig_error") {
            await failWithShot(
                driver,
                "ig-04-something-went-wrong",
                `Instagram step4 wizard stuck before caption (nextClicks=${nextClicks}, ${JSON.stringify(status)})`,
            );
        }
        if (status?.status === "next") {
            nextClicks += 1;
            await debugShot(driver, `ig-04-after-next-${nextClicks}`);
            // Person reviews crop/filter before continuing.
            await humanPause(2200, 4200);
            continue;
        }
        await humanPause(800, 1400);
    }

    const state = await diagnoseInstagramPublish(driver);
    await failWithShot(
        driver,
        "ig-04-wizard-timeout",
        `Instagram step4 wizard stuck before caption (nextClicks=${nextClicks}, ${JSON.stringify(state)})`,
    );
}

async function typeCaptionHuman(driver, text) {
    const boxes = await driver.findElements({
        css: "[aria-label='Add a caption...'], [aria-label*='Add a caption' i]",
    });
    const box = boxes[0];
    if (!box) {
        return false;
    }

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
    await humanPause(500, 1000);

    await driver.actions({ async: true }).move({ origin: box }).pause(250).click().pause(400).perform();
    const active = await driver.switchTo().activeElement();
    await active.sendKeys(Key.chord(Key.CONTROL, "a"));
    await humanPause(120, 280);
    await active.sendKeys(Key.BACK_SPACE);
    await humanPause(350, 700);

    for (const character of text) {
        await active.sendKeys(character);
        if (character === "\n") {
            await humanPause(280, 520);
        } else if (character === " ") {
            await humanPause(90, 220);
        } else if (/[.,!?#]/.test(character)) {
            await humanPause(140, 320);
        } else {
            await humanPause(45, 130);
        }
    }

    // Stop typing and "look" at the caption before Share.
    await humanPause(1200, 2200);
    return true;
}

async function typeCaption(driver, caption, hashtags) {
    const text = [caption, hashtags].filter(Boolean).join("\n");
    if (!text) {
        await debugShot(driver, "ig-05-no-caption");
        return;
    }

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        await dismissNotNow(driver);
        const ready = await driver.executeScript(`
          ${PAGE_HELPERS}
          return !!findCaption();
        `);
        if (ready) {
            break;
        }
        await driver.executeScript(`
          ${PAGE_HELPERS}
          const next = findNext();
          if (next) next.click();
        `);
        await humanPause(900, 1600);
    }

    await debugShot(driver, "ig-05-before-caption");

    const probe = text.slice(0, Math.min(10, text.length));
    let applied = "";

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const typed = await typeCaptionHuman(driver, text);
        if (!typed) {
            break;
        }
        applied = await driver.executeScript(`
          ${PAGE_HELPERS}
          const el = findCaption();
          return el ? String(el.innerText || "").trim() : "";
        `);
        await debugShot(driver, `ig-05-caption-attempt-${attempt}`);
        if (String(applied || "").includes(probe)) {
            await humanPause(800, 1500);
            return;
        }
        await humanPause(700, 1300);
    }

    if (!String(applied || "").includes(probe)) {
        const state = await diagnoseInstagramPublish(driver);
        await failWithShot(
            driver,
            "ig-05-caption-not-applied",
            `Instagram step5 caption not applied (ui=${JSON.stringify(applied)}, ${JSON.stringify(state)})`,
        );
    }
}

async function clickShare(driver) {
    await debugShot(driver, "ig-06-before-share");
    await humanPause(900, 1800);

    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
        await dismissNotNow(driver);
        const shared = await driver.executeScript(`
          ${PAGE_HELPERS}
          const share = findShare();
          if (!share) return false;
          share.scrollIntoView({ block: "center" });
          share.click();
          return true;
        `);
        if (shared) {
            await humanPause(2500, 4500);
            await debugShot(driver, "ig-06-after-share");
            // Extra beat for "post shared" toast / dialog close.
            await humanPause(2000, 3500);
            await debugShot(driver, "ig-07-done");
            return;
        }
        await humanPause(700, 1200);
    }

    const state = await diagnoseInstagramPublish(driver);
    await failWithShot(
        driver,
        "ig-06-share-missing",
        `Instagram step6 Share missing (${JSON.stringify(state)})`,
    );
}

export async function publishInstagramImagePost({ driver, mediaPath, caption, hashtags }) {
    await openUrl(driver, "https://www.instagram.com/");
    await humanPause(2200, 3800);
    await dismissNotNow(driver);
    await humanPause(600, 1200);
    await dismissNotNow(driver);

    await openCreatePost(driver);
    await attachImage(driver, mediaPath);
    await clickThroughNext(driver);
    await typeCaption(driver, caption, hashtags);
    await clickShare(driver);
}
