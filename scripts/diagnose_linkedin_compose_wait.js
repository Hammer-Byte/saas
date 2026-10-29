import {
    linkedinSleep,
    loginLinkedinWithCookie,
    openFirefox,
    openLinkedinUrl,
} from "../libs/linkedin_browser.js";

const cookie = String(Bun.env.LI_AT || "").trim();
if (!cookie) {
    console.error("Set LI_AT");
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
    await linkedinSleep(3000);

    const href = await driver.executeScript(`
        const a = [...document.querySelectorAll("a")].find((x) =>
            /send a message to/i.test(x.getAttribute("aria-label") || "")
        );
        return a ? a.href : "";
    `);
    console.log("open", href);
    await openLinkedinUrl(driver, href);

    for (let i = 0; i < 20; i++) {
        const found = await driver.executeScript(`
            const compose =
                document.querySelector(".msg-form__contenteditable") ||
                document.querySelector("[contenteditable='true']");
            const events = document.querySelectorAll(
                ".msg-s-event-listitem, .msg-s-message-list__event, .msg-s-message-group"
            );
            const send = document.querySelector("button.msg-form__send-button");
            const titles = [...document.querySelectorAll("h1,h2,h3,.msg-entity-lockup__entity-title")]
                .map((e) => (e.innerText || "").trim())
                .filter(Boolean)
                .slice(0, 8);
            return {
                hasCompose: Boolean(compose),
                composeAria: compose ? compose.getAttribute("aria-label") || "" : "",
                eventCount: events.length,
                hasSend: Boolean(send),
                titles,
                bodyHasWrite: /write a message/i.test(document.body.innerText || ""),
                url: location.href,
            };
        `);
        console.log(i, found);
        if (found.hasCompose) {
            break;
        }
        await linkedinSleep(1000);
    }
} catch (error) {
    console.error(error);
    process.exit(1);
} finally {
    if (driver) {
        await driver.quit().catch(() => undefined);
    }
}
