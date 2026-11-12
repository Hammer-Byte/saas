import { By } from "selenium-webdriver";
import {
    finishLinkedinInvite,
    humanClick,
    humanPause,
    linkedinSleep,
    navigateBack,
    openLinkedinUrl,
    randomBetween,
} from "../linkedin_browser.js";

// Captured from the live LinkedIn profile overflow UI.
export const PROFILE_MORE_XPATH =
    "/html/body/div[1]/div[1]/div[2]/div[2]/div/main/div/div/section/div/div/div[1]/div/section/div/div/div[2]/div[3]/div/div[1]/div/div[4]/button";
export const PROFILE_CONNECT_XPATH = "/html/body/div[2]/div/div/div[3]/div/div/a";
export const SEND_WITHOUT_NOTE_XPATH =
    "/html/body/div/dialog/div/div/div/div/div/div[2]/div/button";

function labelOfScript() {
    return `
        const labelOf = (el) => ((el.getAttribute("aria-label") || "") + " " + (el.innerText || ""))
            .replace(/\\s+/g, " ").trim().toLowerCase();
    `;
}

export async function waitForInviteDialog(driver, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ready = await driver.executeScript(
            `
            ${labelOfScript()}
            const sendPath = arguments[0];
            if (document.evaluate(sendPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue) {
                return true;
            }
            return [...document.querySelectorAll('dialog, div[role="dialog"], [role="alertdialog"]')].some((dialog) => {
                const text = ((dialog.innerText || "") + " " + [...dialog.querySelectorAll("button, a, [role='button']")].map(labelOf).join(" ")).toLowerCase();
                if (text.includes("this is a modal window") && text.length < 40) return false;
                return /send without a note|send invitation|send now|add a note|email to connect|invitation limit|\\bsend\\b/i.test(text);
            });
            `,
            SEND_WITHOUT_NOTE_XPATH,
        );
        if (ready) {
            return true;
        }
        await linkedinSleep(250);
    }
    return false;
}

async function dismissBlockingOverlays(driver) {
    await driver.executeScript(`
        for (const el of document.querySelectorAll("video, .vjs-modal-dialog, [class*='media-player']")) {
            try { el.remove(); } catch (error) {}
        }
        for (const btn of document.querySelectorAll("button")) {
            const label = ((btn.getAttribute("aria-label") || "") + " " + (btn.innerText || "")).toLowerCase();
            if (label.includes("close modal") || label === "dismiss" || label.includes("close dialog")) {
                try { btn.click(); } catch (error) {}
            }
        }
    `);
}

async function clickByXPath(driver, xpath, { requireLabel = null } = {}) {
    const els = await driver.findElements(By.xpath(xpath));
    if (!els.length) {
        return false;
    }
    const el = els[0];
    if (requireLabel) {
        const label = await driver.executeScript(
            `
            const el = arguments[0];
            return ((el.getAttribute("aria-label") || "") + " " + (el.innerText || ""))
                .replace(/\\s+/g, " ").trim().toLowerCase();
            `,
            el,
        );
        if (!requireLabel.test(String(label || ""))) {
            return false;
        }
    }
    return humanClick(driver, el);
}

async function clickCss(driver, css) {
    const els = await driver.findElements(By.css(css));
    if (!els.length) {
        return false;
    }
    return humanClick(driver, els[0]);
}

async function markProfileMoreButton(driver) {
    return driver.executeScript(`
        ${labelOfScript()}
        const main = document.querySelector("main") || document.body;
        document.querySelectorAll("[data-li-profile-more]").forEach((el) => el.removeAttribute("data-li-profile-more"));

        const follows = [...main.querySelectorAll("button")].filter((button) => {
            if (button.closest("aside, nav, footer")) return false;
            const text = labelOf(button);
            return text === "follow" || text.startsWith("follow ");
        });

        const groups = [];
        for (const follow of follows) {
            let node = follow.parentElement;
            for (let depth = 0; depth < 10 && node && node !== main; depth++) {
                const buttons = [...node.querySelectorAll("button")];
                const more = buttons.find((button) => {
                    const text = labelOf(button);
                    return text === "more" || text === "more actions";
                });
                if (!more) {
                    node = node.parentElement;
                    continue;
                }
                const message = buttons.find((button) => labelOf(button).includes("message"))
                    || [...node.querySelectorAll("a")].find((anchor) => labelOf(anchor).includes("message"));
                groups.push({ more, depth, score: message ? 0 : 1 });
                break;
            }
        }

        groups.sort((a, b) => a.score - b.score || a.depth - b.depth);
        if (!groups.length) {
            const more = [...main.querySelectorAll("button")].find((button) => {
                if (button.closest("aside, nav, footer")) return false;
                const text = labelOf(button);
                return text === "more" || text === "more actions";
            });
            if (!more) return { ok: false };
            more.setAttribute("data-li-profile-more", "1");
            return { ok: true, via: "main-more" };
        }
        groups[0].more.setAttribute("data-li-profile-more", "1");
        return { ok: true, via: "follow-group" };
    `);
}

async function markConnectMenuItem(driver) {
    return driver.executeScript(`
        ${labelOfScript()}
        document.querySelectorAll("[data-li-profile-connect]").forEach((el) => el.removeAttribute("data-li-profile-connect"));

        const byPath = document.evaluate(
            "/html/body/div[2]/div/div/div[3]/div/div/a",
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
        ).singleNodeValue;
        if (byPath && /\\bconnect\\b/i.test(labelOf(byPath))) {
            byPath.setAttribute("data-li-profile-connect", "1");
            return { ok: true, via: "xpath" };
        }

        const menus = [...document.querySelectorAll('[role="menu"], .artdeco-dropdown__content')].filter((menu) => {
            const style = getComputedStyle(menu);
            const text = (menu.innerText || "").toLowerCase();
            return style.display !== "none"
                && style.visibility !== "hidden"
                && !text.includes("subtitles")
                && !text.includes("view profile")
                && !text.includes("sales nav")
                && /\\bconnect\\b/i.test(text);
        });
        const menu = menus[0];
        if (!menu) return { ok: false };

        const item = [...menu.querySelectorAll('[role="menuitem"], a, button')].find((el) => {
            const key = el.getAttribute("componentkey") || "";
            const text = labelOf(el);
            return key.includes("ConnectButtonstate")
                || text === "connect"
                || /^connect\\b/.test(text)
                || (/invite/.test(text) && /connect/.test(text));
        });
        if (!item) return { ok: false };

        const inner = item.querySelector('[aria-label*="Invite"][aria-label*="connect"]') || item;
        inner.setAttribute("data-li-profile-connect", "1");
        return { ok: true, via: "menu" };
    `);
}

async function inviteDialogStillOpen(driver) {
    return driver.executeScript(`
        return [...document.querySelectorAll("dialog, div[role='dialog'], [role='alertdialog']")].some((dialog) =>
            /send without a note|add a note/i.test(dialog.innerText || "")
        );
    `);
}

/** Click a profile link on the current list page (search/grow) — no typed URL. */
export async function openProfileByClick(driver, profileUrl) {
    const normalized = String(profileUrl || "").replace(/\/$/, "");
    if (!normalized) {
        return false;
    }

    const marked = await driver.executeScript(
        `
        const target = (arguments[0] || "").replace(/\\/$/, "");
        document.querySelectorAll("[data-li-open-profile]").forEach((el) => el.removeAttribute("data-li-open-profile"));
        const links = [...document.querySelectorAll('a[href*="/in/"]')];
        const match = links.find((link) => {
            const href = (link.href || "").split("?")[0].replace(/\\/$/, "");
            return href === target || href.endsWith(target.replace("https://www.linkedin.com", ""));
        });
        if (!match) return false;
        match.setAttribute("data-li-open-profile", "1");
        return true;
        `,
        normalized,
    );
    if (!marked) {
        return false;
    }

    const el = await driver.findElement(By.css('[data-li-open-profile="1"]'));
    await humanClick(driver, el);
    await humanPause(2000, 4000);
    const url = await driver.getCurrentUrl();
    return url.includes("/in/");
}

async function returnToList(driver, returnUrl) {
    if (!returnUrl) {
        return;
    }
    const hint = returnUrl.includes("/search/")
        ? "/search/"
        : returnUrl.includes("/mynetwork/grow")
          ? "/mynetwork/grow"
          : "";
    const backed = await navigateBack(driver, hint, 4);
    if (backed) {
        await humanPause(1500, 3000);
        return;
    }
    // Recovery only — list page restore if back-stack was lost.
    await openLinkedinUrl(driver, returnUrl);
    await humanPause(1500, 3000);
}

/**
 * Assumes we are already on the profile page.
 * 1) Connect on action bar if present
 * 2) else More → Connect
 * 3) Send without a note
 */
export async function connectOnCurrentProfile(driver, name) {
    await dismissBlockingOverlays(driver);
    await linkedinSleep(randomBetween(250, 600));

    const directConnect = await driver.executeScript(`
        ${labelOfScript()}
        document.querySelectorAll("[data-li-profile-connect]").forEach((el) => el.removeAttribute("data-li-profile-connect"));
        const main = document.querySelector("main") || document.body;
        const button = [...main.querySelectorAll("button, a")].find((el) => {
            if (el.closest("aside, nav, footer")) return false;
            const text = labelOf(el);
            if (text.includes("pending") || text.includes("connected") || text.includes("disconnect")) return false;
            return text === "connect" || (text.includes("invite") && text.includes("to connect"));
        });
        if (!button) return false;
        button.setAttribute("data-li-profile-connect", "1");
        return true;
    `);

    let connectClicked = false;
    if (directConnect) {
        connectClicked = await clickCss(driver, '[data-li-profile-connect="1"]');
        await humanPause(1500, 3000);
    }

    if (!connectClicked) {
        let moreClicked = await clickByXPath(driver, PROFILE_MORE_XPATH, {
            requireLabel: /more/,
        });
        if (!moreClicked) {
            const more = await markProfileMoreButton(driver);
            if (!more?.ok) {
                return "skipped";
            }
            moreClicked = await clickCss(driver, '[data-li-profile-more="1"]');
        }
        if (!moreClicked) {
            return "skipped";
        }

        await humanPause(1500, 3000);

        connectClicked = await clickByXPath(driver, PROFILE_CONNECT_XPATH, {
            requireLabel: /connect/,
        });
        if (!connectClicked) {
            const connect = await markConnectMenuItem(driver);
            if (!connect?.ok) {
                return "skipped";
            }
            connectClicked = await clickCss(driver, '[data-li-profile-connect="1"]');
        }
        if (!connectClicked) {
            return "skipped";
        }
        await humanPause(1500, 3000);
    }

    if (!(await waitForInviteDialog(driver, 10_000))) {
        return "skipped";
    }

    if (await clickByXPath(driver, SEND_WITHOUT_NOTE_XPATH)) {
        await humanPause(1500, 3000);
        if (!(await inviteDialogStillOpen(driver))) {
            return "sent";
        }
    }

    return finishLinkedinInvite(driver, name);
}

/**
 * Click into profile from the list (no typed profile URL), then connect.
 */
export async function connectViaProfileMoreMenu(driver, profileUrl, name, returnUrl) {
    if (!profileUrl) {
        return "skipped";
    }

    const backTo = returnUrl || (await driver.getCurrentUrl());
    const opened = await openProfileByClick(driver, profileUrl);
    if (!opened) {
        // Last resort if the card link was virtualized away.
        await openLinkedinUrl(driver, profileUrl);
        await humanPause(2000, 4000);
    }

    const result = await connectOnCurrentProfile(driver, name);
    await returnToList(driver, backTo);
    return result;
}
