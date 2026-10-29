/**
 * End-to-end MessageNetwork DOM flow check (no send by default).
 * LI_AT='...' bun scripts/diagnose_linkedin_message_flow.js
 * LI_AT='...' SEND=1 bun scripts/diagnose_linkedin_message_flow.js
 */
import {
    LinkedinMessagePage,
    matchDesignationPool,
} from "../libs/linkedin_connects/linkedin_message_pom.js";
import {
    loginLinkedinWithCookie,
    openFirefox,
} from "../libs/linkedin_browser.js";

const cookie = String(Bun.env.LI_AT || "").trim();
const shouldSend = String(Bun.env.SEND || "") === "1";
if (!cookie) {
    console.error("Set LI_AT");
    process.exit(1);
}

let driver = null;
try {
    driver = await openFirefox();
    await loginLinkedinWithCookie(driver, cookie);
    await LinkedinMessagePage.open(driver);
    const ready = await LinkedinMessagePage.waitForCards(driver);
    console.log("cards ready:", ready);
    console.log("diagnose:", JSON.stringify(await LinkedinMessagePage.diagnose(driver), null, 2));

    const cards = await LinkedinMessagePage.readCards(driver);
    console.log("cards:", cards.length);
    console.log(JSON.stringify(cards.slice(0, 3), null, 2));
    if (!cards.length) {
        process.exit(2);
    }

    const pools = [
        { name: "CTO", messages: ["Hi — quick hello from HammerByte test."] },
        { name: "Founder", messages: ["Hi — quick hello from HammerByte test."] },
        { name: "Professor", messages: ["Hi — quick hello from HammerByte test."] },
        { name: "Business Development", messages: ["Hi — quick hello from HammerByte test."] },
    ];

    const target =
        cards.find((card) => matchDesignationPool(card.headline, pools)) || cards[0];
    console.log("target:", target);

    await LinkedinMessagePage.openComposeUrl(driver, target.composeUrl);
    const dialogReady = await LinkedinMessagePage.waitForMessageDialog(driver);
    console.log("compose ready:", dialogReady);
    const dialog = await LinkedinMessagePage.inspectOpenDialog(driver);
    console.log("dialog:", dialog);

    if (shouldSend && dialogReady && dialog?.isNew) {
        const result = await LinkedinMessagePage.typeAndSend(
            driver,
            "Hi — quick hello from HammerByte automation test.",
        );
        console.log("send result:", result);
    } else {
        console.log("skipping send (set SEND=1 to send)");
    }
} catch (error) {
    console.error(error);
    process.exit(1);
} finally {
    if (driver) {
        await driver.quit().catch(() => undefined);
    }
}
