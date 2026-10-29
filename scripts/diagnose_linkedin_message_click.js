/**
 * Probe Message anchor href + composer after click.
 * Run: LI_AT='...' bun scripts/diagnose_linkedin_message_click.js
 */
import { By } from "selenium-webdriver";
import {
    linkedinSleep,
    loginLinkedinWithCookie,
    openFirefox,
    openLinkedinUrl,
} from "../libs/linkedin_browser.js";

const cookie = String(Bun.env.LI_AT || "").trim();
if (!cookie) {
    console.error("Set LI_AT env var");
    process.exit(1);
}

let driver = null;
try {
    driver = await openFirefox();
    await loginLinkedinWithCookie(driver, cookie);
    await openLinkedinUrl(
        driver,
        "https://www.linkedin.com/mynetwork/invite-connect/connections/",
    );
    await linkedinSleep(4000);

    const info = await driver.executeScript(`
        const links = [...document.querySelectorAll("a")].filter((a) =>
            /send a message to/i.test(a.getAttribute("aria-label") || "")
        );
        return links.slice(0, 3).map((a) => ({
            aria: a.getAttribute("aria-label"),
            href: a.getAttribute("href"),
            target: a.getAttribute("target"),
            role: a.getAttribute("role"),
            outer: a.outerHTML.slice(0, 700),
        }));
    `);
    console.log("anchors:", JSON.stringify(info, null, 2));

    const el = await driver.findElement(
        By.css('a[aria-label*="Send a message to"]'),
    );
    const href = await el.getAttribute("href");
    console.log("href full:", href);

    await driver.executeScript(
        "arguments[0].scrollIntoView({block:'center'})",
        el,
    );
    await linkedinSleep(400);

    if (href && /messaging|message/i.test(href)) {
        const absolute = href.startsWith("http")
            ? href
            : `https://www.linkedin.com${href}`;
        console.log("navigating:", absolute);
        await openLinkedinUrl(driver, absolute);
        await linkedinSleep(4000);
    } else {
        const actions = driver.actions({ async: true });
        await actions.move({ origin: el }).pause(200).click().perform();
        await linkedinSleep(4000);
    }

    console.log("url after:", await driver.getCurrentUrl());
    const dump = await driver.executeScript(`
        return {
            url: location.href,
            title: document.title,
            body: (document.body.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 1800),
            contenteditables: [...document.querySelectorAll("[contenteditable], textarea, [role=textbox]")].map((el) => ({
                tag: el.tagName,
                role: el.getAttribute("role"),
                aria: el.getAttribute("aria-label"),
                placeholder: el.getAttribute("placeholder"),
                className: String(el.className || "").slice(0, 180),
            })),
            dialogs: [...document.querySelectorAll("[role=dialog], dialog")].map((el) => ({
                aria: el.getAttribute("aria-label"),
                text: ((el.innerText || "") + "").replace(/\\s+/g, " ").trim().slice(0, 240),
                className: String(el.className || "").slice(0, 180),
            })),
        };
    `);
    console.log(JSON.stringify(dump, null, 2));
} catch (error) {
    console.error(error);
    process.exit(1);
} finally {
    if (driver) {
        await driver.quit().catch(() => undefined);
    }
}
