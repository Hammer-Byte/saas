import { contentPublishSleep, openUrl } from "../content_publish_browser.js";

/**
 * Facebook personal feed image post.
 * Locators refined when a Facebook cookie is provided for live simulation.
 */
export async function publishFacebookImagePost({ driver, mediaPath, caption }) {
    await openUrl(driver, "https://www.facebook.com/");
    await contentPublishSleep(2500);

    const opened = await driver.executeScript(`
      const nodes = [...document.querySelectorAll("div[role='button'], span")];
      const create = nodes.find((el) => /what.?s on your mind|create post|photo\\/video/i.test(
        (el.getAttribute("aria-label") || el.innerText || "")
      ));
      if (!create) return false;
      create.click();
      return true;
    `);
    if (!opened) {
        throw new Error("Facebook step2 create-post control not found (needs live cookie tuning)");
    }

    await contentPublishSleep(1500);
    const inputs = await driver.findElements({ css: "input[type=file]" });
    if (!inputs.length) {
        throw new Error("Facebook step3 file input not found (needs live cookie tuning)");
    }
    await inputs[0].sendKeys(mediaPath);
    await contentPublishSleep(2500);

    const typed = await driver.executeScript(
        `
      const box = document.querySelector("div[role='textbox'][contenteditable='true']");
      if (!box) return false;
      box.focus();
      box.textContent = String(arguments[0] || "");
      box.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return true;
    `,
        caption,
    );
    if (!typed) {
        throw new Error("Facebook step4 caption box not found (needs live cookie tuning)");
    }

    const posted = await driver.executeScript(`
      const buttons = [...document.querySelectorAll("div[role='button'], button")];
      const post = buttons.find((el) => /^post$/i.test((el.getAttribute("aria-label") || el.innerText || "").trim()));
      if (!post) return false;
      post.click();
      return true;
    `);
    if (!posted) {
        throw new Error("Facebook step5 Post button not found (needs live cookie tuning)");
    }
    await contentPublishSleep(3000);
}
