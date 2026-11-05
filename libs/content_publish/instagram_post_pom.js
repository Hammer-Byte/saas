import { Key } from "selenium-webdriver";
import { logger } from "@hammerbyte/utils";
import { contentPublishSleep, openUrl } from "../content_publish_browser.js";
import {
    attachScreenshotToError,
    captureContentPublishScreenshot,
} from "../content_publish_screenshot.js";

function igLog(message) {
    logger.info(`content-publish ig ${message}`);
}

/** Step screenshots for the current IG publish attempt (attached to history on failure). */
let stepShots = [];

function resetStepShots() {
    stepShots = [];
}

/**
 * Instagram feed image post — human-paced + Crop/Edit readiness gates.
 *
 * Failure mode we saw: Crop looks fine → Next → blank Edit → "Something went wrong".
 * Fix: wait for real crop preview before Next; wait for Edit to hydrate; never Next a blank Edit;
 * one full retry (close + re-upload) on blank Edit / Meta error.
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
    if (/create new post|crop|edit|filters|share|caption|select from computer|add a caption|something went wrong/i.test(text)) {
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

function findTryAgain() {
  return [...document.querySelectorAll("button, div[role='button']")].find((el) =>
    /^try again$/i.test(buttonLabel(el))
  ) || null;
}

function findDismissCreate() {
  const dialog = findCreateDialog();
  const scope = dialog || document;
  return scope.querySelector("svg[aria-label='Close']")?.closest("button, div[role='button']")
    || [...scope.querySelectorAll("button, div[role='button']")].find((el) => {
      const aria = normalize(el.getAttribute("aria-label"));
      return /^close$/i.test(aria) || /^dismiss$/i.test(aria);
    })
    || null;
}

function findBack() {
  const scopes = [findCreateDialog(), document].filter(Boolean);
  for (const scope of scopes) {
    const back = [...scope.querySelectorAll("div[role='button'], button")].find((el) => {
      const aria = normalize(el.getAttribute("aria-label"));
      const label = buttonLabel(el);
      return /^back$/i.test(aria) || /^back$/i.test(label);
    });
    if (back) return back;
  }
  const svg = document.querySelector("svg[aria-label='Back']");
  return svg ? (svg.closest("button, div[role='button']") || svg) : null;
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

function dialogTitle() {
  const dialog = findCreateDialog();
  if (!dialog) return "";
  const heading = dialog.querySelector("h1, h2, [role='heading']");
  if (heading) return normalize(heading.innerText);
  const text = normalize(dialog.innerText || "");
  if (/^crop\\b/i.test(text) || /\\bcrop\\b/i.test(text.slice(0, 40))) return "Crop";
  if (/^edit\\b/i.test(text) || /\\bedit\\b/i.test(text.slice(0, 40))) return "Edit";
  if (/create new post/i.test(text.slice(0, 80))) return "Create new post";
  if (/new post/i.test(text.slice(0, 80))) return "New post";
  return text.slice(0, 40);
}

function countPreviewMedia() {
  const dialog = findCreateDialog() || document;
  return [...dialog.querySelectorAll("img, video, canvas")].filter((el) => {
    if (el.tagName === "IMG") {
      const src = el.currentSrc || el.src || "";
      return (src.startsWith("blob:") || src.startsWith("data:image/") || el.naturalWidth > 80)
        && el.getClientRects().length > 0;
    }
    if (el.tagName === "VIDEO") {
      return el.getClientRects().length > 0 && (el.videoWidth > 40 || el.readyState >= 2);
    }
    // canvas
    const rect = el.getClientRects()[0];
    return !!rect && rect.width > 80 && rect.height > 80;
  }).length;
}

function wizardStage() {
  if (findCaption() || findShare()) return "caption";
  const dialog = findCreateDialog();
  const text = normalize(dialog?.innerText || "");
  if (/something went wrong/i.test(text)) return "error";
  if (/select from computer|drag photos and videos here/i.test(text) && countPreviewMedia() === 0) {
    return "select";
  }
  const title = dialogTitle();
  if (/^crop$/i.test(title) || (/\\bcrop\\b/i.test(text.slice(0, 60)) && findNext())) {
    return countPreviewMedia() > 0 ? "crop_ready" : "crop_empty";
  }
  if (/^edit$/i.test(title) || (/\\bedit\\b/i.test(text.slice(0, 60)) && findNext())) {
    // Blank Edit: title Edit + Next but almost no media / filter UI.
    const hasFilters = /filters|adjustments|original/i.test(text);
    if (countPreviewMedia() > 0 || hasFilters) return "edit_ready";
    return "edit_blank";
  }
  if (countPreviewMedia() > 0 && findNext()) return "crop_ready";
  return "unknown";
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
        const fileName = await captureContentPublishScreenshot(driver, label);
        if (fileName) {
            stepShots.push(fileName);
        }
        igLog(`screenshot ${label} -> ${fileName} (total=${stepShots.length})`);
        return fileName;
    } catch (error) {
        igLog(`screenshot ${label} failed: ${error instanceof Error ? error.message : error}`);
        return null;
    }
}

async function failWithShot(driver, label, message) {
    const screenshotFile = await debugShot(driver, label);
    throw attachScreenshotToError(new Error(message), screenshotFile, stepShots);
}

export async function diagnoseInstagramPublish(driver) {
    return await driver.executeScript(`
      ${PAGE_HELPERS}
      const dialog = findCreateDialog();
      return {
        url: location.href,
        stage: wizardStage(),
        title: dialogTitle(),
        previews: countPreviewMedia(),
        newPost: !!findNewPostControl(),
        fileInputs: document.querySelectorAll("input[type='file']").length,
        next: !!findNext(),
        share: !!findShare(),
        caption: !!findCaption(),
        captionText: (findCaption()?.innerText || "").slice(0, 120),
        notNow: !!findNotNow(),
        dialogs: document.querySelectorAll("div[role='dialog']").length,
        dialogText: String((dialog || {}).innerText || "").slice(0, 180),
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

async function closeCreateFlow(driver) {
    igLog("closing create dialog for retry");
    await driver.executeScript(`
      ${PAGE_HELPERS}
      const tryAgain = findTryAgain();
      if (tryAgain) tryAgain.click();
    `);
    await humanPause(600, 1000);
    await driver.executeScript(`
      ${PAGE_HELPERS}
      const close = findDismissCreate();
      if (close) close.click();
    `);
    await humanPause(800, 1400);
    // Confirm leave if Instagram asks.
    await driver.executeScript(`
      ${PAGE_HELPERS}
      const nodes = [...document.querySelectorAll("button, div[role='button']")];
      const leave = nodes.find((el) => /^leave$/i.test(buttonLabel(el)) || /^discard$/i.test(buttonLabel(el)));
      if (leave) leave.click();
    `);
    await humanPause(1000, 1800);
    await debugShot(driver, "ig-retry-after-close");
}

async function openCreatePost(driver) {
    igLog("step open create post");
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
    igLog("clicked New post");
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
        igLog("create dialog opened without Post submenu");
    } else {
        igLog("selected Post from create menu");
    }
    await humanPause(1400, 2600);
    await debugShot(driver, "ig-02-create-dialog");
}

async function attachImage(driver, mediaPath) {
    igLog(`step upload image path=${mediaPath}`);
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

    let chosen = inputs[0];
    for (const input of inputs) {
        const accept = String((await input.getAttribute("accept")) || "").toLowerCase();
        if (
            accept.includes("image") ||
            accept.includes("jpeg") ||
            accept.includes("png") ||
            accept.includes("webp")
        ) {
            chosen = input;
            break;
        }
    }

    await debugShot(driver, "ig-03-before-upload");
    await humanPause(500, 1100);
    await chosen.sendKeys(mediaPath);
    igLog("file sent to input, waiting for crop preview (not only Next)");

    await humanPause(3000, 5000);
    await dismissNotNow(driver);
    await debugShot(driver, "ig-03-after-upload");

    const readyDeadline = Date.now() + 35000;
    while (Date.now() < readyDeadline) {
        await dismissNotNow(driver);
        const state = await diagnoseInstagramPublish(driver);
        if (state.stage === "error") {
            await failWithShot(
                driver,
                "ig-03-upload-error",
                `Instagram step3 error after upload (${JSON.stringify(state)})`,
            );
        }
        // Require Crop with a real preview — Next alone is not enough.
        if (state.stage === "crop_ready" || (state.previews > 0 && state.next)) {
            igLog(`upload crop ready previews=${state.previews} stage=${state.stage}`);
            await humanPause(1200, 2200);
            await debugShot(driver, "ig-03-upload-ready");
            return;
        }
        if (state.stage === "caption" || state.stage === "edit_ready") {
            igLog(`upload already past crop stage=${state.stage}`);
            await debugShot(driver, "ig-03-upload-ready");
            return;
        }
        await humanPause(700, 1200);
    }

    const state = await diagnoseInstagramPublish(driver);
    await failWithShot(
        driver,
        "ig-03-upload-not-ready",
        `Instagram step3 crop preview not ready (${JSON.stringify(state)})`,
    );
}

async function clickNextOnce(driver) {
    return await driver.executeScript(`
      ${PAGE_HELPERS}
      const next = findNext();
      if (!next) return false;
      next.scrollIntoView({ block: "center" });
      next.click();
      return true;
    `);
}

async function goBackOnce(driver) {
    return await driver.executeScript(`
      ${PAGE_HELPERS}
      const back = findBack();
      if (!back) return false;
      back.click();
      return true;
    `);
}

async function clickThroughNext(driver) {
    igLog("step crop/filter Next with readiness gates");
    const deadline = Date.now() + 75000;
    let nextClicks = 0;
    let waitShots = 0;
    let blankEditRecoveries = 0;

    while (Date.now() < deadline) {
        await dismissNotNow(driver);
        const state = await diagnoseInstagramPublish(driver);
        igLog(
            `wizard stage=${state.stage} previews=${state.previews} next=${state.next} clicks=${nextClicks}`,
        );

        if (state.stage === "caption" || state.share || state.caption) {
            igLog(`wizard reached caption after nextClicks=${nextClicks}`);
            await humanPause(1000, 2000);
            await debugShot(driver, "ig-04-caption-screen");
            return { ok: true };
        }

        if (state.stage === "error") {
            await debugShot(driver, "ig-04-something-went-wrong");
            return { ok: false, reason: "ig_error", state };
        }

        if (state.stage === "edit_blank") {
            await debugShot(driver, `ig-04-edit-blank-${blankEditRecoveries + 1}`);
            if (blankEditRecoveries < 2) {
                blankEditRecoveries += 1;
                igLog("blank Edit detected — going Back to Crop to re-hydrate");
                const backed = await goBackOnce(driver);
                await humanPause(2000, 3500);
                if (!backed) {
                    return { ok: false, reason: "edit_blank", state };
                }
                continue;
            }
            igLog("blank Edit persisted after Back retries");
            return { ok: false, reason: "edit_blank", state };
        }

        if (state.stage === "crop_empty") {
            waitShots += 1;
            if (waitShots <= 5 || waitShots % 3 === 0) {
                await debugShot(driver, `ig-04-crop-empty-${waitShots}`);
            }
            await humanPause(900, 1500);
            continue;
        }

        if (state.stage === "crop_ready") {
            // Extra beat so crop canvas finishes before Next.
            await humanPause(1500, 2800);
            const recheck = await diagnoseInstagramPublish(driver);
            if (recheck.stage !== "crop_ready" || recheck.previews < 1) {
                continue;
            }
            const clicked = await clickNextOnce(driver);
            if (!clicked) {
                await humanPause(800, 1200);
                continue;
            }
            nextClicks += 1;
            igLog(`clicked Next #${nextClicks} from crop_ready`);
            await debugShot(driver, `ig-04-after-next-${nextClicks}`);
            // Wait for Edit to hydrate (or caption) before considering another Next.
            const editDeadline = Date.now() + 15000;
            while (Date.now() < editDeadline) {
                await humanPause(800, 1400);
                const after = await diagnoseInstagramPublish(driver);
                if (after.stage === "caption" || after.caption || after.share) {
                    await debugShot(driver, "ig-04-caption-screen");
                    return { ok: true };
                }
                if (after.stage === "edit_ready") {
                    igLog("Edit hydrated with preview/filters");
                    await debugShot(driver, "ig-04-edit-ready");
                    break;
                }
                if (after.stage === "edit_blank") {
                    igLog("landed on blank Edit after Crop Next");
                    break;
                }
                if (after.stage === "error") {
                    await debugShot(driver, "ig-04-something-went-wrong");
                    return { ok: false, reason: "ig_error", state: after };
                }
            }
            continue;
        }

        if (state.stage === "edit_ready") {
            await humanPause(1200, 2200);
            const recheck = await diagnoseInstagramPublish(driver);
            if (recheck.stage === "caption" || recheck.caption) {
                await debugShot(driver, "ig-04-caption-screen");
                return { ok: true };
            }
            if (recheck.stage !== "edit_ready") {
                continue;
            }
            const clicked = await clickNextOnce(driver);
            if (!clicked) {
                await humanPause(800, 1200);
                continue;
            }
            nextClicks += 1;
            igLog(`clicked Next #${nextClicks} from edit_ready`);
            await debugShot(driver, `ig-04-after-next-${nextClicks}`);
            await humanPause(2200, 4000);
            continue;
        }

        // unknown / select — wait
        waitShots += 1;
        if (waitShots <= 4 || waitShots % 3 === 0) {
            await debugShot(driver, `ig-04-waiting-${waitShots}`);
        }
        await humanPause(800, 1400);
    }

    const state = await diagnoseInstagramPublish(driver);
    return { ok: false, reason: "timeout", state };
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

    await humanPause(1200, 2200);
    return true;
}

async function typeCaption(driver, caption, hashtags) {
    const text = [caption, hashtags].filter(Boolean).join("\n");
    if (!text) {
        igLog("step caption skipped (empty)");
        await debugShot(driver, "ig-05-no-caption");
        return;
    }

    igLog(`step caption typing chars=${text.length}`);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        await dismissNotNow(driver);
        const state = await diagnoseInstagramPublish(driver);
        if (state.caption || state.stage === "caption") {
            break;
        }
        if (state.stage === "edit_ready") {
            await clickNextOnce(driver);
        }
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
            igLog(`caption applied attempt=${attempt}`);
            await humanPause(800, 1500);
            return;
        }
        igLog(`caption not confirmed attempt=${attempt}`);
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
    igLog("step Share");
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
            igLog("Share clicked");
            await humanPause(2500, 4500);
            await debugShot(driver, "ig-06-after-share");
            await humanPause(2000, 3500);
            await debugShot(driver, "ig-07-done");
            igLog("publish flow finished");
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

async function runPublishOnce(driver, mediaPath, caption, hashtags) {
    await openCreatePost(driver);
    await attachImage(driver, mediaPath);
    const wizard = await clickThroughNext(driver);
    if (!wizard.ok) {
        return wizard;
    }
    await typeCaption(driver, caption, hashtags);
    await clickShare(driver);
    return { ok: true };
}

export async function publishInstagramImagePost({ driver, mediaPath, caption, hashtags }) {
    resetStepShots();
    igLog("publish start");
    try {
        await openUrl(driver, "https://www.instagram.com/");
        await humanPause(2200, 3800);
        await dismissNotNow(driver);
        await humanPause(600, 1200);
        await dismissNotNow(driver);
        await debugShot(driver, "ig-00-after-home-settle");

        let result = await runPublishOnce(driver, mediaPath, caption, hashtags);
        if (!result.ok && (result.reason === "ig_error" || result.reason === "edit_blank")) {
            igLog(`first attempt failed reason=${result.reason} — full retry once`);
            await debugShot(driver, "ig-retry-before");
            await closeCreateFlow(driver);
            await openUrl(driver, "https://www.instagram.com/");
            await humanPause(2000, 3500);
            await dismissNotNow(driver);
            result = await runPublishOnce(driver, mediaPath, caption, hashtags);
        }

        if (!result.ok) {
            await failWithShot(
                driver,
                `ig-04-${result.reason || "failed"}`,
                `Instagram step4 wizard failed (${result.reason}, ${JSON.stringify(result.state || {})})`,
            );
        }

        igLog(`publish ok screenshots=${stepShots.length}`);
    } catch (error) {
        throw attachScreenshotToError(
            error instanceof Error ? error : new Error(String(error)),
            null,
            stepShots,
        );
    }
}
