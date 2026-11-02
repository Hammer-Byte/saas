import { contentPublishSleep, openUrl } from "../content_publish_browser.js";

/**
 * Instagram feed image post wizard.
 * Locators refined when an Instagram cookie is provided for live simulation.
 */
export async function publishInstagramImagePost({ driver, mediaPath, caption, hashtags }) {
    await openUrl(driver, "https://www.instagram.com/");
    await contentPublishSleep(2500);

    const opened = await driver.executeScript(`
      const create = document.querySelector("svg[aria-label='New post']")
        || document.querySelector("a[href*='/create']")
        || [...document.querySelectorAll("span, a, div")].find((el) => /^create$/i.test((el.innerText || "").trim()));
      if (!create) return false;
      (create.closest("a, button, div[role='button']") || create).click();
      return true;
    `);
    if (!opened) {
        throw new Error("Instagram step2 Create control not found (needs live cookie tuning)");
    }

    await contentPublishSleep(1500);
    const inputs = await driver.findElements({ css: "input[type=file]" });
    if (!inputs.length) {
        throw new Error("Instagram step3 file input not found (needs live cookie tuning)");
    }
    await inputs[0].sendKeys(mediaPath);
    await contentPublishSleep(2500);

    for (let index = 0; index < 3; index += 1) {
        const advanced = await driver.executeScript(`
          const next = [...document.querySelectorAll("div[role='button'], button")].find((el) =>
            /^next$/i.test((el.innerText || "").trim())
          );
          if (!next) return false;
          next.click();
          return true;
        `);
        if (!advanced) {
            break;
        }
        await contentPublishSleep(1200);
    }

    const text = [caption, hashtags].filter(Boolean).join("\n");
    const typed = await driver.executeScript(
        `
      const area = document.querySelector("textarea[aria-label*='caption' i]")
        || document.querySelector("div[role='textbox'][contenteditable='true']")
        || document.querySelector("textarea");
      if (!area) return false;
      area.focus();
      if (area.tagName === "TEXTAREA") {
        area.value = String(arguments[0] || "");
      } else {
        area.textContent = String(arguments[0] || "");
      }
      area.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    `,
        text,
    );
    if (!typed) {
        throw new Error("Instagram step4 caption field not found (needs live cookie tuning)");
    }

    const shared = await driver.executeScript(`
      const share = [...document.querySelectorAll("div[role='button'], button")].find((el) =>
        /^share$/i.test((el.innerText || "").trim())
      );
      if (!share) return false;
      share.click();
      return true;
    `);
    if (!shared) {
        throw new Error("Instagram step5 Share button not found (needs live cookie tuning)");
    }
    await contentPublishSleep(3000);
}
