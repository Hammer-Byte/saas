import { Builder, Browser } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

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

export async function openFirefox() {
    const options = new firefox.Options()
        .setBinary(FIREFOX_BINARY)
        .setPageLoadStrategy("eager")
        .windowSize({ width: 1440, height: 1000 });

    const driver = await new Builder()
        .forBrowser(Browser.FIREFOX)
        .setFirefoxOptions(options)
        .build();

    await driver.manage().setTimeouts({ implicit: 0, pageLoad: 20_000 });
    return driver;
}

export async function openUrl(driver, url) {
    try {
        await driver.get(url);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/timeout/i.test(message)) {
            throw error;
        }
    }
}

export function contentPublishSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loginLinkedinWithCookie(driver, cookie) {
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

export async function loginFacebookWithCookie(driver, cookieValue) {
    await openUrl(driver, "https://www.facebook.com/");
    const parts = parseFacebookCookieBlob(cookieValue);
    for (const part of parts) {
        await driver.manage().addCookie({
            name: part.name,
            value: part.value,
            domain: ".facebook.com",
            path: "/",
            secure: true,
        });
    }
    await openUrl(driver, "https://www.facebook.com/");
    await contentPublishSleep(2000);
    const url = await driver.getCurrentUrl();
    if (/login|checkpoint/i.test(url)) {
        throw new Error(`Facebook login failed at ${url}`);
    }
}

export async function loginInstagramWithCookie(driver, cookieValue) {
    await openUrl(driver, "https://www.instagram.com/");
    const parts = normalizeInstagramCookies(cookieValue);
    if (!parts.some((part) => part.name === "sessionid" && part.value)) {
        throw new Error("Instagram cookie must include sessionid");
    }
    for (const part of parts) {
        await driver.manage().addCookie({
            name: part.name,
            value: part.value,
            domain: ".instagram.com",
            path: "/",
            secure: true,
            httpOnly: part.name === "sessionid",
        });
    }
    await openUrl(driver, "https://www.instagram.com/");
    await contentPublishSleep(2500);
    await waitForInstagramLogin(driver);
}

async function waitForInstagramLogin(driver) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        const state = await driver.executeScript(`
          return {
            url: location.href,
            hasCreate: !!(
              document.querySelector("svg[aria-label='New post']")
              || document.querySelector("svg[aria-label='Create']")
              || document.querySelector("a[href*='/create']")
            ),
            hasHome: !!(
              document.querySelector("svg[aria-label='Home']")
              || document.querySelector("a[href='/']")
            ),
          };
        `);
        if (/accounts\/login|challenge|two_factor|auth_platform/i.test(state.url)) {
            break;
        }
        if (state.hasCreate || state.hasHome || /instagram\.com\/?$|instagram\.com\/(reels|direct|explore)/i.test(state.url)) {
            return;
        }
        await contentPublishSleep(1000);
    }
    const url = await driver.getCurrentUrl();
    throw new Error(`Instagram login failed at ${url}`);
}

function normalizeInstagramCookies(cookieValue) {
    const trimmed = String(cookieValue || "").trim();
    let parts = [];
    if (!trimmed.includes("=")) {
        parts = [{ name: "sessionid", value: trimmed }];
    } else {
        parts = parseNameValueCookieBlob(trimmed);
    }
    return parts
        .map((part) => {
            let value = String(part.value || "").trim();
            try {
                value = decodeURIComponent(value);
            } catch {
                // keep raw value
            }
            return { name: part.name, value };
        })
        .filter((part) => part.name && part.value);
}

export async function loginYoutubeWithCookie(driver, cookieValue) {
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

    // Community posts run on www.youtube.com; Netscape exports are usually .youtube.com only.
    await openUrl(driver, "https://www.youtube.com/");
    for (const part of parts) {
        await addCookieBestEffort(driver, part, ".youtube.com");
    }
    await openUrl(driver, "https://www.youtube.com/");
    await contentPublishSleep(2500);
    await waitForYoutubeLogin(driver);
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

function parseFacebookCookieBlob(cookieValue) {
    const trimmed = String(cookieValue || "").trim();
    if (trimmed.includes("=") && (trimmed.includes("c_user") || trimmed.includes(";"))) {
        return parseNameValueCookieBlob(trimmed);
    }
    return [{ name: "c_user", value: trimmed }];
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
