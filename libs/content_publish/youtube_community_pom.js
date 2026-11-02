import { contentPublishSleep, openUrl } from "../content_publish_browser.js";

/**
 * YouTube Community image post.
 * Locators refined when a YouTube cookie is provided for live simulation.
 */
export async function publishYoutubeCommunityImagePost({
    driver,
    mediaPath,
    title,
    description,
}) {
    await openUrl(driver, "https://studio.youtube.com/");
    await contentPublishSleep(3000);

    const opened = await driver.executeScript(`
      const create = [...document.querySelectorAll("button, ytcp-button, div[role='button']")].find((el) =>
        /create|community|post/i.test((el.getAttribute("aria-label") || el.innerText || ""))
      );
      if (!create) return false;
      create.click();
      return true;
    `);
    if (!opened) {
        throw new Error(
            "YouTube step2 Create/Community control not found (needs live cookie tuning)",
        );
    }

    await contentPublishSleep(1500);
    const inputs = await driver.findElements({ css: "input[type=file]" });
    if (!inputs.length) {
        throw new Error("YouTube step3 file input not found (needs live cookie tuning)");
    }
    await inputs[0].sendKeys(mediaPath);
    await contentPublishSleep(2500);

    const text = [title, description].filter(Boolean).join("\n\n");
    const typed = await driver.executeScript(
        `
      const box = document.querySelector("div[contenteditable='true']")
        || document.querySelector("textarea");
      if (!box) return false;
      box.focus();
      if (box.tagName === "TEXTAREA") {
        box.value = String(arguments[0] || "");
      } else {
        box.textContent = String(arguments[0] || "");
      }
      box.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    `,
        text,
    );
    if (!typed) {
        throw new Error("YouTube step4 text box not found (needs live cookie tuning)");
    }

    const posted = await driver.executeScript(`
      const post = [...document.querySelectorAll("button, ytcp-button, div[role='button']")].find((el) =>
        /^post$/i.test((el.getAttribute("aria-label") || el.innerText || "").trim())
      );
      if (!post) return false;
      post.click();
      return true;
    `);
    if (!posted) {
        throw new Error("YouTube step5 Post button not found (needs live cookie tuning)");
    }
    await contentPublishSleep(3000);
}
