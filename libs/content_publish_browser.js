import { openConfiguredFirefox } from "./selenium_firefox.js";

export let processing = false;

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
    return openConfiguredFirefox({
        width: 1440,
        height: 1000,
        pageLoadStrategy: "eager",
    });
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
    await openUrl(driver, "https://www.youtube.com/");
    const parts = parseNameValueCookieBlob(cookieValue);
    for (const part of parts) {
        await driver.manage().addCookie({
            name: part.name,
            value: part.value,
            domain: part.domain || ".youtube.com",
            path: "/",
            secure: true,
        });
    }
    await openUrl(driver, "https://www.youtube.com/");
    await contentPublishSleep(2000);
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
