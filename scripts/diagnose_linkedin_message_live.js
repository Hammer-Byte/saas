/**
 * Live LinkedIn MessageNetwork connections-page diagnostic.
 * Run: LI_AT='...' bun scripts/diagnose_linkedin_message_live.js
 */
import { logger } from "@hammerbyte/utils";
import {
    linkedinSleep,
    loginLinkedinWithCookie,
    openFirefox,
} from "../libs/linkedin_browser.js";
import { LinkedinMessagePage } from "../libs/linkedin_connects/linkedin_message_pom.js";

const cookie = String(Bun.env.LI_AT || "").trim();

if (!cookie) {
    console.error("Set LI_AT env var");
    process.exit(1);
}

let driver = null;
try {
    driver = await openFirefox();
    console.log("logging in…");
    await loginLinkedinWithCookie(driver, cookie);
    console.log("login ok:", await driver.getCurrentUrl());

    console.log("opening connections…");
    await LinkedinMessagePage.open(driver);
    const ready = await LinkedinMessagePage.waitForCards(driver);
    console.log("cards ready:", ready);

    const diagnosis = await LinkedinMessagePage.diagnose(driver);
    console.log(JSON.stringify(diagnosis, null, 2));

    const cards = await LinkedinMessagePage.readCards(driver);
    console.log("readCards:", cards.length);
    console.log(JSON.stringify(cards.slice(0, 5), null, 2));

    if (!cards.length) {
        process.exit(2);
    }

    const target = cards[0];
    console.log(`opening Message for ${target.name}…`);
    const opened = await LinkedinMessagePage.openMessageForProfile(
        driver,
        target.profileUrl,
        target.name,
    );
    console.log("opened:", opened);
    const dialogReady = await LinkedinMessagePage.waitForMessageDialog(driver);
    console.log("dialog ready:", dialogReady);
    console.log("dialog:", JSON.stringify(await LinkedinMessagePage.inspectOpenDialog(driver), null, 2));
    await LinkedinMessagePage.closeDialog(driver);
    await linkedinSleep(1000);
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`diagnose failed: ${message}`);
    console.error(message);
    process.exit(1);
} finally {
    if (driver) {
        await driver.quit().catch(() => undefined);
    }
}
