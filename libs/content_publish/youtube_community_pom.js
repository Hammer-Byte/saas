import { Key } from "selenium-webdriver";
import { logger } from "@hammerbyte/utils";
import { contentPublishSleep, openUrl } from "../content_publish_browser.js";
import { failWithScreenshot } from "../content_publish_screenshot.js";

/**
 * YouTube Community image post on a specific channel (brand accounts supported).
 *
 * Critical: stay on /channel/{UC…}/posts — never fall back to homepage Create
 * (that posts as the default/personal channel).
 */

function normalizeChannelId(value) {
    const text = String(value || "").trim();
    if (!text) {
        return "";
    }
    const fromUrl = text.match(/channel\/(UC[\w-]+)/i);
    if (fromUrl) {
        return fromUrl[1];
    }
    if (/^UC[\w-]+$/i.test(text)) {
        return text;
    }
    return "";
}

async function failStep(driver, message, label = "yt-fail") {
    await failWithScreenshot(driver, message, label);
}

async function detectGoogleChallenge(driver) {
    return await driver.executeScript(`
      const text = String(document.body?.innerText || "");
      const title = String(document.title || "");
      const hay = (text + "\\n" + title).slice(0, 8000);
      if (/verify it'?s you|confirm it'?s really you/i.test(hay)) {
        return "Google asked to Verify it's you (complete this once in a normal browser, then refresh the YouTube cookie)";
      }
      if (/account recovery|unusual activity|sign in to continue/i.test(hay)) {
        return "Google sign-in / account challenge blocked YouTube";
      }
      if (/recaptcha|captcha/i.test(hay)) {
        return "Google captcha blocked YouTube";
      }
      return null;
    `);
}

async function failUnlessReady(driver, message, label) {
    const challenge = await detectGoogleChallenge(driver);
    if (challenge) {
        await failStep(driver, challenge, label);
    }
    await failStep(driver, message, label);
}

async function clickByLabel(driver, patterns) {
    return await driver.executeScript(
        `
      const patterns = arguments[0].map((source) => new RegExp(source, "i"));
      const nodes = [...document.querySelectorAll(
        "button, yt-button-shape button, a, tp-yt-paper-button, div[role='button'], yt-icon-button, yt-button-renderer"
      )];
      for (const pattern of patterns) {
        const el = nodes.find((node) => {
          const aria = (node.getAttribute("aria-label") || "").trim();
          const text = (node.innerText || "").replace(/\\s+/g, " ").trim();
          const title = (node.getAttribute("title") || "").trim();
          return pattern.test(aria) || pattern.test(text) || pattern.test(title);
        });
        if (el) {
          el.click();
          return true;
        }
      }
      return false;
    `,
        patterns,
    );
}

async function dismissCommunityIntro(driver) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const clicked = await clickByLabel(driver, ["^not now$", "^got it$", "^no thanks$"]);
        if (!clicked) {
            return;
        }
        await contentPublishSleep(1000);
    }
}

async function diagnoseChannelContext(driver, channelId) {
    return await driver.executeScript(
        `
      const wanted = String(arguments[0] || "");
      const href = String(location.href || "");
      const html = String(document.documentElement?.innerHTML || "");
      const text = String(document.body?.innerText || "");
      const inUrl = wanted && href.includes(wanted);
      const inHtml = wanted && html.includes(wanted);
      const hasAddImage = [...document.querySelectorAll(
        "button, yt-button-shape button, yt-icon-button, div[role='button']"
      )].some((el) => {
        const aria = (el.getAttribute("aria-label") || "").trim();
        const label = (el.innerText || "").replace(/\\s+/g, " ").trim();
        // Exact Image control — not "Image poll".
        return /^add an image$/i.test(aria)
          || (/^image$/i.test(label) && !/poll/i.test(aria + " " + label));
      });
      const hasCaption = [...document.querySelectorAll("#contenteditable-root, [contenteditable='true']")]
        .some((el) => {
          const aria = (el.getAttribute("aria-label") || "").toLowerCase();
          return el.getClientRects().length > 0
            && (/message|shoutout|share|photo|caption|post/i.test(aria) || el.id === "contenteditable-root");
        });
      const hasPost = [...document.querySelectorAll("button, yt-button-shape button")].some((el) => {
        const aria = (el.getAttribute("aria-label") || "").trim();
        const label = (el.innerText || "").replace(/\\s+/g, " ").trim();
        return /^post$/i.test(aria) || /^post$/i.test(label);
      });
      const communityComposer = /give a shoutout|what's on your mind|image poll|visibility:\\s*public|create a post|text poll|behind-the-scenes/i
        .test(text.slice(0, 5000));
      const viewerBlocked = /subscribe to this channel for at least 1 day to post/i.test(text);
      // Do NOT treat stray page file inputs as compose-ready.
      return {
        url: href,
        inUrl,
        inHtml,
        matched: !!(inUrl || inHtml),
        hasCompose: !!(hasAddImage || (hasCaption && communityComposer) || (hasPost && communityComposer)),
        hasAddImage,
        hasCaption,
        hasPost,
        communityComposer,
        viewerBlocked,
        snippet: text.slice(0, 220),
      };
    `,
        channelId,
    );
}

async function assertChannelContext(driver, channelId, label) {
    const state = await diagnoseChannelContext(driver, channelId);
    logger.info(
        `content-publish yt channel-check matched=${state.matched} inUrl=${state.inUrl} compose=${state.hasCompose} url=${state.url}`,
    );
    if (!state.matched) {
        await failStep(
            driver,
            `YouTube channel context mismatch (wanted=${channelId}, ${JSON.stringify(state)})`,
            label,
        );
    }
    return state;
}

async function readStudioChannelHints(driver, channelId) {
    await openUrl(driver, `https://studio.youtube.com/channel/${channelId}`);
    await contentPublishSleep(3500);
    return await driver.executeScript(`
      const title = String(document.title || "");
      const text = String(document.body?.innerText || "").slice(0, 2500);
      const hints = [];
      const dash = title.indexOf(" - ");
      if (dash > 0) {
        const left = title.slice(0, dash).trim();
        if (left && !/^channel dashboard$/i.test(left)) hints.push(left);
      }
      const brand = text.match(/\\b([A-Za-z][A-Za-z0-9 ._-]{1,40})\\b(?=\\s*Dashboard)/);
      if (brand?.[1] && !/^your channel$/i.test(brand[1])) hints.push(brand[1].trim());
      const handle = text.match(/@[A-Za-z0-9._-]{2,}/);
      if (handle) hints.push(handle[0]);
      const yourIdx = text.toLowerCase().indexOf("your channel");
      if (yourIdx >= 0) {
        const slice = text.slice(yourIdx, yourIdx + 160);
        const lines = slice.split("\\n").map((part) => part.trim()).filter(Boolean);
        for (const line of lines.slice(1, 4)) {
          if (line && !/^dashboard$/i.test(line) && !/^your channel$/i.test(line)) {
            hints.push(line);
          }
        }
      }
      // Sidebar channel name often sits next to "Your channel".
      const nameEl = document.querySelector("#channel-title, #entity-name, ytcp-channel-name, #channel-name");
      if (nameEl?.textContent) hints.push(String(nameEl.textContent).trim());
      return [...new Set(hints.map((h) => String(h || "").trim()).filter(Boolean))].slice(0, 6);
    `);
}

async function clickChannelInAccountList(driver, channelId, channelHints = []) {
    return await driver.executeScript(
        `
      const wanted = String(arguments[0] || "");
      const hints = (arguments[1] || []).map((h) => String(h || "").trim().toLowerCase()).filter(Boolean);
      const accountItems = [...document.querySelectorAll("ytd-account-item-renderer")];
      const score = (el) => {
        const href = el.getAttribute("href")
          || el.querySelector?.("a")?.getAttribute("href")
          || "";
        const text = ((el.innerText || "") + " " + href + " " + (el.getAttribute("aria-label") || ""))
          .replace(/\\s+/g, " ")
          .trim();
        const lower = text.toLowerCase();
        if (href.includes(wanted) || text.includes(wanted)) return 100;
        for (const hint of hints) {
          if (hint && lower.includes(hint)) return 80;
        }
        return 0;
      };
      let best = null;
      let bestScore = 0;
      for (const el of accountItems) {
        const s = score(el);
        if (s > bestScore) {
          best = el;
          bestScore = s;
        }
      }
      if ((!best || bestScore < 80) && accountItems.length >= 2) {
        const unselected = accountItems.find((el) => {
          const selected = el.hasAttribute("is-selected")
            || el.getAttribute("aria-selected") === "true"
            || !!el.querySelector("#selected, [aria-label*='current channel' i]");
          const html = String(el.innerHTML || "");
          const hasCheck = /checkmark|check-circle|selected/i.test(html);
          return !selected && !hasCheck;
        });
        best = unselected || accountItems[accountItems.length - 1];
        bestScore = 50;
      }
      if (!best) {
        return {
          ok: false,
          count: accountItems.length,
          url: location.href,
          sample: accountItems.slice(0, 8).map((el) => (el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 80)),
        };
      }
      (best.querySelector("a") || best).click();
      return {
        ok: true,
        score: bestScore,
        text: (best.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 100),
        url: location.href,
      };
    `,
        channelId,
        channelHints,
    );
}

async function switchViaAccountSwitcher(driver, channelId, channelHints = []) {
    const urls = [
        `https://www.youtube.com/channel_switcher?next=${encodeURIComponent(
            `/channel/${channelId}/community?show_create_dialog=1`,
        )}`,
        "https://www.youtube.com/account",
        "https://www.youtube.com/channel_switcher",
    ];

    for (const url of urls) {
        logger.info(`content-publish yt opening channel switcher url=${url}`);
        await openUrl(driver, url);
        const waitUntil = Date.now() + 15000;
        while (Date.now() < waitUntil) {
            const ready = await driver.executeScript(
                `return document.querySelectorAll("ytd-account-item-renderer").length`,
            );
            if (Number(ready) > 0) {
                break;
            }
            // Avatar menu fallback: Account menu → Switch account.
            await driver.executeScript(`
              const avatar = document.querySelector("#avatar-btn, button#avatar-btn, button[aria-label*='Account menu' i]");
              if (avatar) avatar.click();
            `);
            await contentPublishSleep(800);
            await clickByLabel(driver, ["^switch account$", "^switch channel$"]);
            await contentPublishSleep(500);
        }

        const clicked = await clickChannelInAccountList(driver, channelId, channelHints);
        logger.info(`content-publish yt switcher click=${JSON.stringify(clicked)}`);
        if (clicked?.ok) {
            await contentPublishSleep(2000);
            await clickByLabel(driver, ["^confirm$", "^switch$", "^continue$"]);
            await contentPublishSleep(3500);
            return true;
        }
    }
    return false;
}

async function establishChannelContext(driver, channelId) {
    // Studio alone is not enough — www Community can still be the personal account.
    // Read brand hints from Studio, switch www identity, then warm Studio again.
    logger.info(`content-publish yt read studio hints channel=${channelId}`);
    const hints = await readStudioChannelHints(driver, channelId);
    logger.info(`content-publish yt channel hints=${JSON.stringify(hints)}`);

    logger.info(`content-publish yt force channel_switcher channel=${channelId}`);
    const switched = await switchViaAccountSwitcher(driver, channelId, hints);
    logger.info(`content-publish yt switcher ok=${switched}`);

    logger.info(`content-publish yt switch studio channel=${channelId}`);
    await openUrl(driver, `https://studio.youtube.com/channel/${channelId}`);
    await contentPublishSleep(3500);

    let state = await diagnoseChannelContext(driver, channelId);
    if (state.matched && /studio\.youtube\.com\/channel\//i.test(state.url)) {
        logger.info("content-publish yt studio channel context ok");
        return;
    }

    if (!state.matched && !switched) {
        await failStep(
            driver,
            `YouTube could not switch to channel ${channelId} (${JSON.stringify(state)})`,
            "yt-channel-switch",
        );
    }
}

async function clickOpenCommunityComposer(driver) {
    // Prefer explicit create/composer entry points on the Community tab.
    const clickedCreate = await clickByLabel(driver, [
        "^create a post$",
        "^create post$",
        "^new post$",
    ]);
    if (clickedCreate) {
        return "create-post";
    }
    const clickedComposer = await driver.executeScript(`
      const box = [...document.querySelectorAll(
        "#contenteditable-root, [contenteditable='true'], div[role='textbox'], button, div[role='button']"
      )].find((el) => {
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();
        const text = (el.innerText || "").replace(/\\s+/g, " ").trim().toLowerCase();
        return /shoutout|create a post|share something|write a post|give a shoutout/.test(aria + " " + text);
      });
      if (!box) return false;
      box.click();
      return true;
    `);
    if (clickedComposer) {
        return "composer-box";
    }
    // Header Create can open a menu — then pick Post/Community if shown.
    const clickedHeaderCreate = await clickByLabel(driver, ["^create$"]);
    if (clickedHeaderCreate) {
        await contentPublishSleep(1000);
        const picked = await clickByLabel(driver, [
            "^create a post$",
            "^post$",
            "^community post$",
        ]);
        if (picked) {
            return "header-create-menu";
        }
    }
    return null;
}

async function openCreatePostDialog(driver, channelId) {
    await establishChannelContext(driver, channelId);

    // /posts?show_create_dialog=1 no longer opens the composer reliably.
    // Community tab does: www.youtube.com/channel/{id}/community
    const communityUrls = [
        `https://www.youtube.com/channel/${channelId}/community?show_create_dialog=1`,
        `https://www.youtube.com/channel/${channelId}/community`,
        `https://www.youtube.com/channel/${channelId}/posts?show_create_dialog=1`,
    ];

    for (const communityUrl of communityUrls) {
        logger.info(`content-publish yt open community create ${communityUrl}`);
        await openUrl(driver, communityUrl);
        await contentPublishSleep(5000);
        await dismissCommunityIntro(driver);

        let state = await diagnoseChannelContext(driver, channelId);
        if (!state.matched) {
            logger.info(`content-publish yt community url left channel context url=${state.url}`);
            continue;
        }
            if (state.viewerBlocked) {
            // Personal Google account is on Community as a viewer, not as the brand channel.
            logger.info("content-publish yt viewer-blocked on community; retrying channel switch");
            const retryHints = await driver.executeScript(`
              const title = String(document.title || "");
              const hints = [];
              const m = title.match(/^(.+?)(?:'s|’s)?\\s+Community/i);
              if (m?.[1]) hints.push(m[1].trim());
              const handle = String(document.body?.innerText || "").match(/@[A-Za-z0-9._-]{2,}/);
              if (handle) hints.push(handle[0]);
              return hints;
            `);
            await switchViaAccountSwitcher(driver, channelId, retryHints || []);
            await openUrl(driver, communityUrl);
            await contentPublishSleep(5000);
            state = await diagnoseChannelContext(driver, channelId);
            if (state.viewerBlocked) {
                await failStep(
                    driver,
                    "YouTube Community is open as a viewer (not the brand channel). Switch to the channel account in YouTube (channel switcher), export a fresh cookie while posting as that channel, then retry.",
                    "yt-viewer-blocked",
                );
            }
        }
        const asCreator = await driver.executeScript(`
          const text = String(document.body?.innerText || "");
          return /\\bmy posts\\b/i.test(text) || /your community is a space for you and your viewers/i.test(text);
        `);
        if (state.hasCompose && !state.viewerBlocked && asCreator) {
            logger.info("content-publish yt compose ready on community tab (creator)");
            return;
        }
        if (state.hasCompose && !asCreator) {
            logger.info("content-publish yt compose visible but not creator identity; will retry switch");
        }

        const opened = await clickOpenCommunityComposer(driver);
        logger.info(`content-publish yt composer open via=${opened || "none"}`);
        await contentPublishSleep(2500);
        await dismissCommunityIntro(driver);

        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            state = await diagnoseChannelContext(driver, channelId);
            const creatorNow = await driver.executeScript(`
              const text = String(document.body?.innerText || "");
              return /\\bmy posts\\b/i.test(text)
                || /your community is a space for you and your viewers/i.test(text);
            `);
            if (state.hasCompose && creatorNow && !state.viewerBlocked) {
                logger.info("content-publish yt compose became ready on community tab (creator)");
                return;
            }
            await contentPublishSleep(800);
        }
    }

    // Last resort: switcher then community tab again.
    const fallbackHints = await readStudioChannelHints(driver, channelId);
    await switchViaAccountSwitcher(driver, channelId, fallbackHints || []);
    const fallbackUrl = `https://www.youtube.com/channel/${channelId}/community`;
    await openUrl(driver, fallbackUrl);
    await contentPublishSleep(5000);
    await clickOpenCommunityComposer(driver);
    await contentPublishSleep(3000);
    const state = await assertChannelContext(driver, channelId, "yt-posts-after-switcher");
    if (state.viewerBlocked) {
        await failStep(
            driver,
            "YouTube Community is open as a viewer (not the brand channel). Switch to the channel account, export a fresh cookie while that channel is active, then retry.",
            "yt-viewer-blocked",
        );
    }
    if (!state.hasCompose) {
        await failUnlessReady(
            driver,
            `YouTube step2 create UI missing for channel ${channelId} (${JSON.stringify(state)})`,
            "yt-step2",
        );
    }
}

async function clickCommunityImageControl(driver) {
    // Prefer aria-label "Add an image" (text is often just "Image").
    const viaAria = await driver.executeScript(`
      const nodes = [...document.querySelectorAll(
        "button, yt-button-shape button, yt-icon-button, div[role='button']"
      )];
      const hit = nodes.find((el) => {
        const aria = (el.getAttribute("aria-label") || "").trim();
        return /^add an image$/i.test(aria);
      });
      if (!hit) return false;
      hit.click();
      return true;
    `);
    if (viaAria) {
        return true;
    }
    const patterns = [
        "^add an image$",
        "^share an image$",
        "^image$",
        "^photo$",
        "^add image$",
        "^add a photo$",
    ];
    if (await clickByLabel(driver, patterns)) {
        return true;
    }
    return await driver.executeScript(`
      const nodes = [...document.querySelectorAll(
        "button, yt-button-shape, yt-button-shape button, yt-icon-button, div[role='button'], a"
      )];
      const hit = nodes.find((el) => {
        const aria = (el.getAttribute("aria-label") || "").trim();
        const text = (el.innerText || "").replace(/\\s+/g, " ").trim();
        if (/poll/i.test(aria + " " + text)) return false;
        return /^add an image$/i.test(aria) || /^image$/i.test(text) || /^photo$/i.test(text);
      });
      if (!hit) return false;
      (hit.querySelector("button") || hit).click();
      return true;
    `);
}

async function attachImage(driver, mediaPath) {
    const challenge = await detectGoogleChallenge(driver);
    if (challenge) {
        await failStep(driver, challenge, "yt-step3");
    }

    // Prefer activating the community Image control; fall back to existing file inputs.
    logger.info("content-publish yt clicking Image control");
    let clicked = await clickCommunityImageControl(driver);
    if (!clicked) {
        // Sometimes the create dialog needs a focus click on the composer first.
        await driver.executeScript(`
          const box = document.querySelector("#contenteditable-root, [aria-label*='shoutout' i], [contenteditable='true']");
          if (box) { box.click(); box.focus(); }
        `);
        await contentPublishSleep(800);
        clicked = await clickCommunityImageControl(driver);
    }
    if (clicked) {
        await contentPublishSleep(1500);
    } else {
        logger.info("content-publish yt Image control not clicked; trying file inputs directly");
    }

    // Dropzone UI: click "select from your computer" when present.
    await driver.executeScript(`
      const link = [...document.querySelectorAll("a, button, span, div[role='button']")]
        .find((el) => /select from your computer/i.test(
          ((el.getAttribute("aria-label") || "") + " " + (el.innerText || "")).trim()
        ));
      if (link) link.click();
    `);
    await contentPublishSleep(800);

    async function collectImageInputs() {
        const inputs = await driver.findElements({ css: "input[type=file]" });
        const imageInputs = [];
        for (const input of inputs) {
            const accept = String((await input.getAttribute("accept")) || "").toLowerCase();
            const className = String((await input.getAttribute("class")) || "");
            if (/image/.test(accept) && !/searchbox/i.test(className)) {
                let visible = true;
                try {
                    const rect = await driver.executeScript(
                        `const r = arguments[0].getBoundingClientRect(); return {w:r.width,h:r.height};`,
                        input,
                    );
                    // Hidden file inputs are fine (w/h often 0); keep all image accepts.
                    visible = true;
                    void rect;
                } catch {
                    visible = true;
                }
                if (visible) {
                    imageInputs.push({ input, accept });
                }
            }
        }
        return imageInputs;
    }

    let imageInputs = await collectImageInputs();
    if (!imageInputs.length && !clicked) {
        await failUnlessReady(
            driver,
            "YouTube step3 Image control missing",
            "yt-step3",
        );
    }
    if (!imageInputs.length) {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline && !imageInputs.length) {
            await contentPublishSleep(500);
            imageInputs = await collectImageInputs();
        }
    }
    if (!imageInputs.length) {
        await failUnlessReady(
            driver,
            "YouTube step3 image file input missing",
            "yt-step3",
        );
    }

    // Prefer the newest image/* input (community dropzone), not the stale page input.
    let chosen = imageInputs[imageInputs.length - 1].input;
    for (let i = imageInputs.length - 1; i >= 0; i -= 1) {
        if (imageInputs[i].accept.includes("image/*")) {
            chosen = imageInputs[i].input;
            break;
        }
    }

    logger.info(`content-publish yt sending image inputs=${imageInputs.length}`);
    await chosen.sendKeys(mediaPath);
    // Wait until dropzone accepts the file (editor controls or preview appear).
    {
        const attachedDeadline = Date.now() + 20000;
        let attached = false;
        while (Date.now() < attachedDeadline) {
            attached = await driver.executeScript(`
              const text = String(document.body?.innerText || "");
              const nodes = [...document.querySelectorAll("button, yt-button-shape button")];
              const hasSave = nodes.some((el) => {
                const aria = (el.getAttribute("aria-label") || "").trim();
                const rect = el.getBoundingClientRect();
                return rect.width > 2 && rect.height > 2 && /^(save images|save preview|edit preview)$/i.test(aria);
              });
              const hasDropPrompt = /drag up to 10 images|select from your computer/i.test(text);
              return hasSave || (/drag to reorder/i.test(text) && !hasDropPrompt);
            `);
            if (attached) break;
            await contentPublishSleep(700);
        }
        if (!attached) {
            await failUnlessReady(
                driver,
                "YouTube step3 image did not attach to community dropzone",
                "yt-step3",
            );
        }
        logger.info("content-publish yt image attached to editor");
    }
    await dismissCommunityIntro(driver);

    // Image editor overlay: keep saving until Save Images / Reposition is gone.
    const saveDeadline = Date.now() + 30000;
    let savedOnce = false;
    while (Date.now() < saveDeadline) {
        await dismissCommunityIntro(driver);
        // Click away "Drag to reorder" coaching tip without closing the editor (no Escape).
        await driver.executeScript(`
          const tipClose = [...document.querySelectorAll("button, yt-icon-button")]
            .find((el) => {
              const label = ((el.getAttribute("aria-label") || "") + " " + (el.innerText || "")).trim();
              const rect = el.getBoundingClientRect();
              return rect.width > 2 && rect.height > 2 && /^got it$/i.test(label);
            });
          if (tipClose) tipClose.click();
        `);
        await contentPublishSleep(200);

        const editorState = await driver.executeScript(`
          const nodes = [...document.querySelectorAll("button, yt-button-shape button")];
          const matchLabel = (el, pattern) => {
            const aria = (el.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim();
            const text = (el.innerText || "").replace(/\\s+/g, " ").trim();
            return pattern.test(aria) || pattern.test(text);
          };
          const visible = (el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 2 && rect.height > 2;
          };
          const enabled = (el) => !(el.disabled || el.getAttribute("aria-disabled") === "true");
          // Prefer final Save Images over intermediate Save Preview.
          const findSave = (pattern, requireVisible) => nodes.find((el) => {
            if (!enabled(el)) return false;
            if (requireVisible && !visible(el)) return false;
            return matchLabel(el, pattern);
          });
          const saveBtn = findSave(/^save images$/i, true)
            || findSave(/^done$/i, true)
            || findSave(/^save images$/i, false)
            || findSave(/^save preview$/i, true)
            || findSave(/^save preview$/i, false);
          const reposition = nodes.some((el) =>
            visible(el) && matchLabel(el, /^(reposition images|edit preview)$/i)
          );
          const cancel = nodes.some((el) =>
            matchLabel(el, /^cancel image post$/i)
          );
          const verify = nodes.some((el) => matchLabel(el, /^verify$/i));
          const bodyText = String(document.body?.innerText || "");
          const viewerBlocked = /subscribe to this channel for at least 1 day to post/i.test(bodyText)
            && /creator posts/i.test(bodyText);
          const dragTip = /drag to reorder/i.test(bodyText);
          if (viewerBlocked) {
            return { phase: "viewer-blocked", reposition, cancel, verify, dragTip };
          }
          if (verify && cancel && !findSave(/^save images$/i, false)) {
            return { phase: "verify-required", reposition, cancel, verify, dragTip };
          }
          if (saveBtn) {
            try { saveBtn.scrollIntoView({ block: "center", inline: "nearest" }); } catch {}
            saveBtn.click();
            return {
              phase: "saving",
              reposition,
              cancel,
              verify,
              dragTip,
              saveLabel: (saveBtn.getAttribute("aria-label") || saveBtn.innerText || "").trim(),
            };
          }
          // Image editor may need a scroll to reveal Save Images.
          if (cancel || reposition || dragTip) {
            const dialog = document.querySelector("div[role='dialog'], tp-yt-paper-dialog, ytd-engagement-panel-section-list-renderer");
            if (dialog) dialog.scrollTop = dialog.scrollHeight;
            window.scrollBy(0, 400);
            return { phase: "editor", reposition, cancel, verify, dragTip };
          }
          return { phase: "done", reposition, cancel, verify, dragTip };
        `);
        logger.info(`content-publish yt image editor=${JSON.stringify(editorState)}`);
        if (editorState?.phase === "viewer-blocked") {
            await failStep(
                driver,
                "YouTube Community is open as a viewer (not the brand channel). Switch to the channel account, export a fresh cookie while that channel is active, then retry.",
                "yt-viewer-blocked",
            );
        }
        if (editorState?.phase === "verify-required") {
            await failStep(
                driver,
                "YouTube Community requires Verify (phone/account verification) before image posts can be saved. Complete Verify once in a normal browser as the brand channel, then retry.",
                "yt-verify-required",
            );
        }
        if (editorState?.phase === "saving") {
            savedOnce = true;
            await contentPublishSleep(1500);
            continue;
        }
        if (editorState?.phase === "done") {
            const composerReady = await driver.executeScript(`
              const text = String(document.body?.innerText || "");
              if (/subscribe to this channel for at least 1 day to post/i.test(text)) {
                return { ready: false, viewerBlocked: true };
              }
              const visibleSave = [...document.querySelectorAll("button, yt-button-shape button")].some((el) => {
                const aria = (el.getAttribute("aria-label") || "").trim();
                const rect = el.getBoundingClientRect();
                return rect.width > 2 && rect.height > 2 && /^save images$/i.test(aria);
              });
              const writeBox = [...document.querySelectorAll("#contenteditable-root, [contenteditable='true']")]
                .some((el) => el.getClientRects().length > 0);
              return { ready: writeBox && !visibleSave, viewerBlocked: false };
            `);
            if (composerReady?.viewerBlocked) {
                await failStep(
                    driver,
                    "YouTube Community is open as a viewer (not the brand channel). Switch to the channel account, export a fresh cookie while that channel is active, then retry.",
                    "yt-viewer-blocked",
                );
            }
            if (composerReady?.ready || savedOnce) {
                logger.info("content-publish yt image preview ready");
                await contentPublishSleep(1000);
                return;
            }
        }
        await contentPublishSleep(700);
    }
    await failUnlessReady(driver, "YouTube step3 image preview missing", "yt-step3");
}

async function typeCaption(driver, title, description) {
    const text = [title, description].filter(Boolean).join("\n\n").trim();
    if (!text) {
        return;
    }

    // Prefer JS insert — Selenium scrollIntoView often fails on yt-formatted-string roots.
    const applied = await driver.executeScript(
        `
      const wanted = String(arguments[0] || "");
      const boxes = [...document.querySelectorAll("#contenteditable-root, [contenteditable='true']")]
        .filter((el) => el.getClientRects().length > 0);
      const box = boxes.find((el) => {
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();
        return el.id === "contenteditable-root"
          || /message|share|photo|caption|post|shoutout/i.test(aria);
      }) || boxes[0];
      if (!box) return { ok: false, reason: "missing" };
      try { box.scrollIntoView({ block: "center", inline: "nearest" }); } catch {}
      box.focus();
      box.click();
      document.execCommand("selectAll", false, null);
      const inserted = document.execCommand("insertText", false, wanted);
      box.dispatchEvent(new InputEvent("input", { bubbles: true, data: wanted, inputType: "insertText" }));
      return {
        ok: true,
        inserted,
        value: String(box.innerText || "").trim().slice(0, 200),
      };
    `,
        text,
    );
    logger.info(`content-publish yt caption js=${JSON.stringify(applied)}`);
    await contentPublishSleep(800);

    const probe = text.slice(0, Math.min(12, text.length));
    if (applied?.ok && String(applied.value || "").includes(probe)) {
        return;
    }

    // Fallback: keyboard into active element without requiring scroll.
    try {
        const boxes = await driver.findElements({
            css: "#contenteditable-root, [contenteditable='true']",
        });
        let box = null;
        for (const candidate of boxes) {
            const id = String((await candidate.getAttribute("id")) || "");
            const aria = String((await candidate.getAttribute("aria-label")) || "").toLowerCase();
            if (id === "contenteditable-root" || /message|share|photo|caption|post|shoutout/i.test(aria)) {
                box = candidate;
                break;
            }
        }
        box = box || boxes[0];
        if (!box) {
            await failUnlessReady(driver, "YouTube step4 caption box missing", "yt-step4");
        }
        await driver.executeScript("arguments[0].focus(); arguments[0].click();", box);
        await contentPublishSleep(200);
        const active = await driver.switchTo().activeElement();
        await active.sendKeys(Key.chord(Key.CONTROL, "a"));
        await active.sendKeys(Key.BACK_SPACE);
        await active.sendKeys(text);
        await contentPublishSleep(900);
    } catch (error) {
        await failUnlessReady(
            driver,
            `YouTube step4 caption failed (${error?.message || error})`,
            "yt-step4",
        );
    }

    const finalValue = await driver.executeScript(`
      const el = [...document.querySelectorAll("#contenteditable-root, [contenteditable='true']")]
        .find((node) => node.getClientRects().length > 0);
      return String(el?.innerText || "").trim();
    `);
    if (!String(finalValue || "").includes(probe)) {
        await failUnlessReady(
            driver,
            `YouTube step4 caption not applied (ui=${JSON.stringify(finalValue)})`,
            "yt-step4",
        );
    }
}

async function clickPost(driver) {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
        await dismissCommunityIntro(driver);
        const posted = await driver.executeScript(`
          const nodes = [...document.querySelectorAll("button, yt-button-shape button")];
          const el = nodes.find((node) => {
            const aria = (node.getAttribute("aria-label") || "").trim();
            const text = (node.innerText || "").replace(/\\s+/g, " ").trim();
            const disabled = node.disabled || node.getAttribute("aria-disabled") === "true";
            return (/^post$/i.test(aria) || /^post$/i.test(text)) && !disabled;
          });
          if (!el) return false;
          el.scrollIntoView({ block: "center" });
          el.click();
          return true;
        `);
        if (posted) {
            await contentPublishSleep(5000);
            return;
        }
        await contentPublishSleep(700);
    }
    await failStep(driver, "YouTube step5 Post button missing/disabled", "yt-step5");
}

export async function publishYoutubeCommunityImagePost({
    driver,
    mediaPath,
    title,
    description,
    channelId = null,
}) {
    const resolvedChannelId = normalizeChannelId(channelId);
    if (!resolvedChannelId) {
        throw new Error(
            "YouTube channel id is required (UC…). Set it on the automation user / publish form.",
        );
    }

    logger.info(`content-publish yt publish start channel=${resolvedChannelId}`);
    await openCreatePostDialog(driver, resolvedChannelId);
    await assertChannelContext(driver, resolvedChannelId, "yt-before-compose");
    logger.info("content-publish yt compose ready, attaching image");
    await attachImage(driver, mediaPath);
    await assertChannelContext(driver, resolvedChannelId, "yt-after-image");
    logger.info("content-publish yt typing caption");
    await typeCaption(driver, title, description);
    logger.info("content-publish yt clicking Post");
    await clickPost(driver);
    logger.info(`content-publish yt publish ok channel=${resolvedChannelId}`);
}
