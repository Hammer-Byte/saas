import { logger } from "@hammerbyte/utils";
import { contentPublishSleep, openUrl } from "../content_publish_browser.js";
import { failWithScreenshot } from "../content_publish_screenshot.js";

/**
 * Facebook personal feed image post.
 * Locators refined when a Facebook cookie is provided for live simulation.
 */
export async function publishFacebookImagePost({ driver, mediaPath, caption }) {
    logger.info("content-publish fb publish start");
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
        await failWithScreenshot(
            driver,
            "Facebook step2 create-post control not found (needs live cookie tuning)",
            "fb-step2-create",
        );
    }
    logger.info("content-publish fb compose opened");

    await contentPublishSleep(1500);
    const inputs = await driver.findElements({ css: "input[type=file]" });
    if (!inputs.length) {
        await failWithScreenshot(
            driver,
            "Facebook step3 file input not found (needs live cookie tuning)",
            "fb-step3-file",
        );
    }
    await inputs[0].sendKeys(mediaPath);
    logger.info("content-publish fb image attached");
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
        await failWithScreenshot(
            driver,
            "Facebook step4 caption box not found (needs live cookie tuning)",
            "fb-step4-caption",
        );
    }
    logger.info("content-publish fb caption typed");

    const posted = await driver.executeScript(`
      const buttons = [...document.querySelectorAll("div[role='button'], button")];
      const post = buttons.find((el) => /^post$/i.test((el.getAttribute("aria-label") || el.innerText || "").trim()));
      if (!post) return false;
      post.click();
      return true;
    `);
    if (!posted) {
        await failWithScreenshot(
            driver,
            "Facebook step5 Post button not found (needs live cookie tuning)",
            "fb-step5-post",
        );
    }
    await contentPublishSleep(3000);
    logger.info("content-publish fb publish ok");
}
