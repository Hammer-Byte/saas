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
    const parts = parseNameValueCookieBlob(cookieValue);
    for (const part of parts) {
        await driver.manage().addCookie({
            name: part.name,
            value: part.value,
            domain: ".instagram.com",
            path: "/",
            secure: true,
        });
    }
    await openUrl(driver, "https://www.instagram.com/");
    await contentPublishSleep(2000);
    const url = await driver.getCurrentUrl();
    if (/accounts\/login|challenge/i.test(url)) {
        throw new Error(`Instagram login failed at ${url}`);
    }
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
