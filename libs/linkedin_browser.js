import { Builder, Browser } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

export let processing = false;

const FIREFOX_BINARY = "/usr/bin/firefox";

export function acquireLinkedinProcessing() {
    if (processing) {
        return false;
    }
    processing = true;
    return true;
}

export function releaseLinkedinProcessing() {
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

export async function openLinkedinUrl(driver, url) {
    try {
        await driver.get(url);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/timeout/i.test(message)) {
            throw error;
        }
    }
}

export function linkedinSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isLinkedinLoggedIn(url) {
    return /https:\/\/([a-z]{2,3}\.)?linkedin\.com\/(feed|search|mynetwork|in)\b/.test(url);
}

export async function loginLinkedinWithCookie(driver, cookie) {
    await openLinkedinUrl(driver, "https://www.linkedin.com");
    await driver.manage().addCookie({
        name: "li_at",
        value: cookie,
        domain: ".linkedin.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "None",
    });
    await openLinkedinUrl(driver, "https://www.linkedin.com/feed/");
    await waitForLinkedinLogin(driver);
}

async function waitForLinkedinLogin(driver) {
    const deadline = Date.now() + 20_000;

    while (Date.now() < deadline) {
        const url = await driver.getCurrentUrl();
        if (isLinkedinLoggedIn(url)) {
            return;
        }
        if (/login|checkpoint|challenge|authwall|uas\/login/i.test(url)) {
            break;
        }
        await linkedinSleep(1000);
    }

    throw new Error(
        "LinkedIn did not accept this li_at cookie. Export a new one while that account is still logged in, and do not log out afterwards.",
    );
}

export async function finishLinkedinInvite(driver, name) {
    const outcome = await driver.executeScript(`
        const bodyText = document.body.innerText || "";
        if (/weekly invitation limit|invitation limit/i.test(bodyText)) return "limit";
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return "none";
        const text = dialog.innerText || "";
        if (/enter their email to connect/i.test(text)) return "email";
        const buttons = [...dialog.querySelectorAll("button")];
        const labelOf = (button) => ((button.getAttribute("aria-label") || "") + " " + (button.innerText || "")).replace(/\\s+/g, " ").trim();
        const sendWithout = buttons.find((button) => /send without a note/i.test(labelOf(button)));
        const send = buttons.find((button) => /^(send|send now|send invitation)$/i.test(labelOf(button)));
        const target = sendWithout || send;
        if (!target) return "none";
        target.click();
        return "sent";
    `);

    if (outcome === "limit") {
        return "limit";
    }
    if (outcome === "email") {
        await dismissLinkedinDialog(driver);
        return "skipped";
    }
    if (outcome === "sent") {
        return "sent";
    }
    if (await invitationIsPending(driver, name)) {
        return "sent";
    }
    await dismissLinkedinDialog(driver);
    return "skipped";
}

async function invitationIsPending(driver, name) {
    return await driver.executeScript(
        `
            const name = (arguments[0] || "").toLowerCase();
            return [...document.querySelectorAll("a, button")].some((el) => {
                const label = ((el.getAttribute("aria-label") || "") + " " + (el.innerText || "")).replace(/\\s+/g, " ").trim().toLowerCase();
                return label.includes("pending") && name && label.includes(name);
            });
        `,
        name,
    );
}

export async function dismissLinkedinDialog(driver) {
    await driver.executeScript(`
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return;
        const close = [...dialog.querySelectorAll("button")].find((button) => {
            const label = ((button.getAttribute("aria-label") || "") + " " + (button.innerText || "")).toLowerCase();
            return label.includes("dismiss") || label.includes("close");
        });
        if (close) close.click();
    `);
}
