import { Key } from "selenium-webdriver";
import { contentPublishSleep, openUrl } from "../content_publish_browser.js";

/**
 * LinkedIn image post — live-tuned.
 *
 * Personal: /sharing/compose
 * Company Page: /company/{id}/admin/page-posts/published/?share=true
 *   (compose opens already as the Page, e.g. "HammerByte Post to Anyone")
 *
 * Flow:
 * 1. Open compose (page admin share URL when companyId set)
 * 2. Media / Add media → Upload from computer if needed
 * 3. input[type=file] sendKeys(image); wait for blob preview
 * 4. Next / Done if shown
 * 5. Caption via keyboard into contenteditable (ProseMirror)
 * 6. Post
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

function countMediaPreviews() {
  return [...document.querySelectorAll("img")].filter((img) => {
    const src = img.currentSrc || img.src || "";
    const alt = String(img.alt || "");
    if (img.naturalWidth <= 40) return false;
    return src.startsWith("blob:")
      || src.startsWith("data:image/")
      || /^Preview of /i.test(alt);
  }).length;
}

function mediaEditorReady() {
  const dialog = document.querySelector("div[role='dialog']");
  const text = normalize(dialog?.innerText || "");
  return /\\b1 of 1\\b/i.test(text)
    || /alternative text/i.test(text)
    || countMediaPreviews() > 0;
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

export async function diagnoseLinkedinPublish(driver) {
    return await driver.executeScript(`
      ${PAGE_HELPERS}
      return {
        url: location.href,
        startPost: !!findStartPostControl(),
        composer: !!findComposer(),
        mediaButton: !!findMediaButton(),
        uploadFromComputer: !!findUploadFromComputer(),
        fileInput: !!document.querySelector("input[type='file']"),
        mediaPreviews: countMediaPreviews(),
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
        const state = await diagnoseLinkedinPublish(driver);
        throw new Error(`LinkedIn step2 start-post missing (${JSON.stringify(state)})`);
    }
    await contentPublishSleep(2000);
}

async function waitForComposeReady(driver, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const state = await diagnoseLinkedinPublish(driver);
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
    const state = await diagnoseLinkedinPublish(driver);
    throw new Error(`LinkedIn step2 compose not ready (${JSON.stringify(state)})`);
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
                const state = await diagnoseLinkedinPublish(driver);
                throw new Error(
                    `LinkedIn step3 upload control missing (${JSON.stringify(state)})`,
                );
            }
            await contentPublishSleep(1000);
            inputs = await waitForFileInputs(driver, 15000);
        }
    }

    if (!inputs.length) {
        const state = await diagnoseLinkedinPublish(driver);
        throw new Error(`LinkedIn step3 file input missing (${JSON.stringify(state)})`);
    }

    let chosen = inputs[0];
    for (const input of inputs) {
        const accept = String((await input.getAttribute("accept")) || "").toLowerCase();
        if (
            accept.includes("image") ||
            accept.includes("jpeg") ||
            accept.includes("jpg") ||
            accept.includes("png")
        ) {
            chosen = input;
            break;
        }
    }

    await chosen.sendKeys(mediaPath);

    const previewDeadline = Date.now() + 30000;
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
        await contentPublishSleep(500);
    }
    if (!previewReady) {
        const state = await diagnoseLinkedinPublish(driver);
        throw new Error(`LinkedIn step3 image preview missing (${JSON.stringify(state)})`);
    }

    await contentPublishSleep(1000);

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

    const doneClicked = await driver.executeScript(`
      ${PAGE_HELPERS}
      const done = findDoneButton();
      if (!done) return false;
      done.click();
      return true;
    `);
    if (doneClicked) {
        await contentPublishSleep(1500);
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
            const editors = await driver.findElements({ css: "div[role='dialog'] div[contenteditable='true'], div[contenteditable='true']" });
            editor = editors[0] || null;
            if (editor) {
                break;
            }
        }
        await contentPublishSleep(400);
    }

    if (!editor) {
        const state = await diagnoseLinkedinPublish(driver);
        throw new Error(`LinkedIn step4 caption editor missing (${JSON.stringify(state)})`);
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
            await contentPublishSleep(5000);
            return;
        }
        await contentPublishSleep(500);
    }
    const state = await diagnoseLinkedinPublish(driver);
    throw new Error(`LinkedIn step5 Post button missing (${JSON.stringify(state)})`);
}

async function openPersonalCompose(driver) {
    await openUrl(driver, "https://www.linkedin.com/sharing/compose");
    await contentPublishSleep(2500);

    let state = await diagnoseLinkedinPublish(driver);
    if (!/sharing\/compose/i.test(state.url) && !state.composer) {
        await openUrl(driver, "https://www.linkedin.com/feed/");
        await contentPublishSleep(2500);
        state = await diagnoseLinkedinPublish(driver);
        if (!state.startPost) {
            throw new Error(`LinkedIn step1 feed not ready (${JSON.stringify(state)})`);
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

    let state = await diagnoseLinkedinPublish(driver);
    if (state.composer || state.mediaButton || state.postButton) {
        return;
    }

    // Fallback: open page posts then Start a post / Create
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
        state = await diagnoseLinkedinPublish(driver);
        throw new Error(`LinkedIn step1 page compose missing (${JSON.stringify(state)})`);
    }
    await contentPublishSleep(2500);
}

export async function publishLinkedinImagePost({
    driver,
    mediaPath,
    caption,
    companyId = null,
}) {
    const resolvedCompanyId = normalizeCompanyId(companyId);
    if (resolvedCompanyId) {
        await openPageCompose(driver, resolvedCompanyId);
    } else {
        await openPersonalCompose(driver);
    }

    await waitForComposeReady(driver);
    await attachImage(driver, mediaPath);
    await typeCaption(driver, caption);
    await clickPost(driver);
}
