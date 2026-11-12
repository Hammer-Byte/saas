import { Builder, Browser, By } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const FIREFOX_BINARY = "/usr/bin/firefox";

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

function inviteDialogHelpers() {
    return `
        const labelOf = (el) => ((el.getAttribute("aria-label") || "") + " " + (el.innerText || ""))
            .replace(/\\s+/g, " ").trim();
        const isDecoyDialog = (dialog) => {
            const text = (dialog.innerText || "").trim();
            return /this is a modal window/i.test(text) && text.length < 40;
        };
        const findInviteDialog = () => {
            // LinkedIn invite UI uses a native <dialog>, not only div[role=dialog].
            const dialogs = [...document.querySelectorAll('dialog, div[role="dialog"], [role="alertdialog"]')];
            return dialogs.find((dialog) => {
                if (isDecoyDialog(dialog)) return false;
                const text = ((dialog.innerText || "") + " " + [...dialog.querySelectorAll("button, a, [role='button']")].map(labelOf).join(" ")).toLowerCase();
                return /send without a note|send invitation|send now|add a note|email to connect|invitation limit|\\bsend\\b/i.test(text);
            }) || null;
        };
        const findSendButton = (dialog) => {
            // Exact path from live LinkedIn invite modal (Send without a note).
            const byPath = document.evaluate(
                "/html/body/div/dialog/div/div/div/div/div/div[2]/div/button",
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
            ).singleNodeValue;
            if (byPath) return byPath;

            const scope = dialog || document;
            const buttons = [...scope.querySelectorAll("button, [role='button'], a")];
            const sendWithout = buttons.find((button) => /send without a note/i.test(labelOf(button)));
            if (sendWithout) return sendWithout;
            return buttons.find((button) => {
                const label = labelOf(button).toLowerCase();
                if (/send without a note/.test(label)) return false;
                return /^(send|send now|send invitation)$/i.test(label) ||
                    label === "send" ||
                    label.includes("send invitation") ||
                    label.includes("send now");
            }) || null;
        };
    `;
}

export async function finishLinkedinInvite(driver, name) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const outcome = await driver.executeScript(`
            ${inviteDialogHelpers()}
            const bodyText = document.body.innerText || "";
            if (/weekly invitation limit|invitation limit/i.test(bodyText)) return { status: "limit" };
            if (/invitation sent|invite sent/i.test(bodyText)) return { status: "sent" };

            const dialog = findInviteDialog();
            if (!dialog) return { status: "none" };

            const text = dialog.innerText || "";
            if (/enter their email to connect/i.test(text)) return { status: "email" };

            document.querySelectorAll("[data-li-send-invite]").forEach((el) => el.removeAttribute("data-li-send-invite"));
            const target = findSendButton(dialog);
            if (!target) return { status: "none", dialogText: text.slice(0, 200) };
            target.setAttribute("data-li-send-invite", "1");
            return { status: "ready", label: labelOf(target) };
        `);

        if (outcome?.status === "limit") {
            return "limit";
        }
        if (outcome?.status === "email") {
            await dismissLinkedinDialog(driver);
            return "skipped";
        }
        if (outcome?.status === "sent") {
            return "sent";
        }

        if (outcome?.status === "ready") {
            const clicked = await clickMarkedInviteSend(driver);
            if (clicked) {
                await linkedinSleep(700);
                const confirmed = await driver.executeScript(`
                    ${inviteDialogHelpers()}
                    if (/invitation sent|invite sent/i.test(document.body.innerText || "")) return true;
                    // Dialog gone after send counts as success.
                    return !findInviteDialog();
                `);
                if (confirmed || await invitationIsPending(driver, name)) {
                    return "sent";
                }
                // Button click may need a moment / retry.
            }
        }

        if (await invitationIsPending(driver, name)) {
            return "sent";
        }

        await linkedinSleep(500);
    }

    await dismissLinkedinDialog(driver);
    return "skipped";
}

async function clickMarkedInviteSend(driver) {
    try {
        const el = await driver.findElement(By.css('[data-li-send-invite="1"]'));
        await driver.executeScript(
            "arguments[0].scrollIntoView({ block: 'center', inline: 'nearest' });",
            el,
        );
        await linkedinSleep(150);
        try {
            await driver.actions({ async: true }).move({ origin: el }).pause(60).click().perform();
            return true;
        } catch {
            try {
                await el.click();
                return true;
            } catch {
                await driver.executeScript("arguments[0].click()", el);
                return true;
            }
        }
    } catch {
        // Fallback: JS click inside the real invite dialog
        return await driver.executeScript(`
            ${inviteDialogHelpers()}
            const dialog = findInviteDialog();
            const target = document.querySelector('[data-li-send-invite="1"]') || findSendButton(dialog);
            if (!target) return false;
            target.click();
            return true;
        `);
    }
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
        const labelOf = (el) => ((el.getAttribute("aria-label") || "") + " " + (el.innerText || ""))
            .replace(/\\s+/g, " ").trim().toLowerCase();
        const dialogs = [...document.querySelectorAll('dialog, div[role="dialog"], [role="alertdialog"]')];
        const invite = dialogs.find((dialog) => {
            const text = (dialog.innerText || "").toLowerCase();
            return /send without a note|add a note|send invitation|invitation/i.test(text);
        }) || dialogs.find((dialog) => {
            const text = (dialog.innerText || "").trim();
            return !( /this is a modal window/i.test(text) && text.length < 40 );
        });
        if (!invite) return;
        const close = [...invite.querySelectorAll("button")].find((button) => {
            const label = labelOf(button);
            return label.includes("dismiss") || label.includes("close");
        });
        if (close) close.click();
        else if (typeof invite.close === "function") invite.close();
    `);
}
