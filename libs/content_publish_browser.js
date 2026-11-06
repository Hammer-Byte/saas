import { Builder, Browser } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { logger } from "@hammerbyte/utils";

export let processing = false;

const FIREFOX_BINARY = "/usr/bin/firefox";

export function acquireContentPublishProcessing() {
    if (processing) {
        return false;
    }
    processing = true;
    return true;
}

export function releaseContentPublishProcessing() {
    processing = false;
}

/** Firefox for YouTube / LinkedIn Selenium publish (Instagram uses Graph API). */
export async function openFirefox() {
    logger.info(
        `content-publish browser launch binary=${FIREFOX_BINARY} moz_headless=${Bun.env.MOZ_HEADLESS || "0"}`,
    );
    const options = new firefox.Options()
        .setBinary(FIREFOX_BINARY)
        .setPageLoadStrategy("eager")
        .windowSize({ width: 1440, height: 1000 });

    const driver = await new Builder()
        .forBrowser(Browser.FIREFOX)
        .setFirefoxOptions(options)
        .build();

    await driver.manage().setTimeouts({ implicit: 0, pageLoad: 20_000 });
    logger.info("content-publish browser ready");
    return driver;
}

function isNavigationTimeoutError(error) {
    const message = error instanceof Error ? error.message : String(error);
    // Firefox: "Navigation timed out after 20000 ms"
    // Chrome/others: often "timeout" / "TimeoutError"
    return /timed\s*out|timeout/i.test(message);
}

export async function openUrl(driver, url) {
    try {
        await driver.get(url);
    } catch (error) {
        if (!isNavigationTimeoutError(error)) {
            throw error;
        }
        logger.info(
            `content-publish openUrl navigation timeout (continuing) url=${url}`,
        );
    }
}

export function contentPublishSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loginLinkedinWithCookie(driver, cookie) {
    logger.info("content-publish linkedin login start");
    await openUrl(driver, "https://www.linkedin.com");
    await driver.manage().addCookie({
        name: "li_at",
        value: cookie,
        domain: ".linkedin.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "None",
    });
    await openUrl(driver, "https://www.linkedin.com/feed/");
    await waitForLinkedinLogin(driver);
    logger.info("content-publish linkedin login ok");
}

async function waitForLinkedinLogin(driver) {
    const deadline = Date.now() + 20_000;

    while (Date.now() < deadline) {
        const url = await driver.getCurrentUrl();
        if (/https:\/\/([a-z]{2,3}\.)?linkedin\.com\/(feed|in|mynetwork)\b/.test(url)) {
            return;
        }
        if (/login|checkpoint|challenge|authwall|uas\/login/i.test(url)) {
            break;
        }
        await contentPublishSleep(1000);
    }

    const url = await driver.getCurrentUrl();
    throw new Error(`LinkedIn login failed at ${url}`);
}

export async function loginYoutubeWithCookie(driver, cookieValue) {
    logger.info("content-publish youtube login start");
    const parts = parseYoutubeCookieBlob(cookieValue);
    if (!parts.length) {
        throw new Error("YouTube cookie blob is empty");
    }

    const names = new Set(parts.map((part) => part.name));
    const hasModernSession = [...names].some((name) =>
        /^(__Secure-1PSID|__Secure-3PSID|LOGIN_INFO)$/i.test(name),
    );
    if (!hasModernSession) {
        throw new Error(
            "YouTube cookie needs __Secure-1PSID / __Secure-3PSID / LOGIN_INFO (Netscape export from youtube.com)",
        );
    }

    logger.info(`content-publish youtube cookies applied count=${parts.length}`);
    // Community posts run on www.youtube.com; Netscape exports are usually .youtube.com only.
    await openUrl(driver, "https://www.youtube.com/");
    for (const part of parts) {
        await addCookieBestEffort(driver, part, ".youtube.com");
    }
    await openUrl(driver, "https://www.youtube.com/");
    await contentPublishSleep(2500);
    await waitForYoutubeLogin(driver);
    logger.info("content-publish youtube login ok");
}

async function addCookieBestEffort(driver, part, domain) {
    const secure = part.secure !== false;
    try {
        await driver.manage().addCookie({
            name: part.name,
            value: part.value,
            domain,
            path: part.path || "/",
            secure,
            sameSite: "None",
        });
    } catch {
        try {
            await driver.manage().addCookie({
                name: part.name,
                value: part.value,
                domain,
                path: part.path || "/",
                secure,
            });
        } catch {
            // Ignore cookies this host rejects.
        }
    }
}

function parseYoutubeCookieBlob(cookieValue) {
    const trimmed = String(cookieValue || "").trim();
    if (!trimmed) {
        return [];
    }
    if (isNetscapeCookieFile(trimmed)) {
        return parseNetscapeCookieFile(trimmed);
    }
    return parseNameValueCookieBlob(trimmed).map((part) => ({
        ...part,
        secure: true,
        path: "/",
    }));
}

function isNetscapeCookieFile(text) {
    return (
        /^#\s*Netscape HTTP Cookie File/im.test(text)
        || /^#HttpOnly_/m.test(text)
        || /^\.[a-z0-9.-]+\t/im.test(text)
    );
}

function parseNetscapeCookieFile(text) {
    return String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
            const cols = line.split("\t");
            if (cols.length < 7) {
                return null;
            }
            const domain = cols[0].replace(/^#HttpOnly_/i, "");
            const path = cols[2] || "/";
            const secure = String(cols[3]).toUpperCase() === "TRUE";
            const name = cols[5];
            const value = cols.slice(6).join("\t");
            if (!name || !value) {
                return null;
            }
            // Skip short-lived Studio transit cookies.
            if (/^ST-/i.test(name) || name === "GPS") {
                return null;
            }
            return { name, value, domain, path, secure };
        })
        .filter(Boolean);
}

async function waitForYoutubeLogin(driver) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const state = await driver.executeScript(`
          const text = String(document.body?.innerText || "");
          const url = location.href;
          const avatar = !!document.querySelector("#avatar-btn, button#avatar-btn, img.yt-spec-avatar-shape__image");
          return {
            avatar,
            create: !![...document.querySelectorAll("button")].find((el) =>
              (el.getAttribute("aria-label") || "").trim() === "Create"
            ),
            createChannel: /create channel/i.test(text.slice(0, 3000)),
            signedOut: /accounts\\.google\\.com\\/v3\\/signin|ServiceLogin/i.test(url)
              || (!avatar && /sign in to youtube|^sign in$/i.test(text.slice(0, 500))),
          };
        `);
        if (state.signedOut) {
            break;
        }
        if (state.createChannel && !state.avatar) {
            throw new Error(
                "YouTube account has no channel yet (Create channel). Community posts need an existing channel.",
            );
        }
        if (state.avatar || state.create) {
            return;
        }
        await contentPublishSleep(1000);
    }
    const url = await driver.getCurrentUrl();
    throw new Error(`YouTube login failed at ${url}`);
}

function parseNameValueCookieBlob(cookieValue) {
    const trimmed = String(cookieValue || "").trim();
    if (!trimmed.includes("=")) {
        return [{ name: "sessionid", value: trimmed }];
    }
    return trimmed
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const index = part.indexOf("=");
            if (index < 0) {
                return null;
            }
            return {
                name: part.slice(0, index).trim(),
                value: part.slice(index + 1).trim(),
            };
        })
        .filter(Boolean);
}
