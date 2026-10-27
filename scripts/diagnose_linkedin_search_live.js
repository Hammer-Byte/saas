/**
 * Live LinkedIn SearchNetwork diagnostic.
 * Run: LI_AT='...' bun scripts/diagnose_linkedin_search_live.js [keyword]
 */
import { logger } from "@hammerbyte/utils";
import {
    linkedinSleep,
    loginLinkedinWithCookie,
    openFirefox,
} from "../libs/linkedin_browser.js";
import { LinkedinSearchPage } from "../libs/linkedin_connects/linkedin_search_pom.js";

const cookie = String(Bun.env.LI_AT || "").trim();
const keyword = String(Bun.argv[2] || "ceo").trim();

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

    console.log(`opening people search for "${keyword}"…`);
    await LinkedinSearchPage.openPeopleSearch(driver, keyword);
    await LinkedinSearchPage.waitForResults(driver);
    const inviteCount = await LinkedinSearchPage.hydrateInviteLinks(driver);
    const diagnosis = await LinkedinSearchPage.diagnosePage(driver);
    console.log(JSON.stringify({ inviteCount, ...diagnosis }, null, 2));

    const cards = await LinkedinSearchPage.readCards(driver);
    const target = cards.find((card) => card.canConnect);
    if (!target) {
        console.log("no connectable people");
        process.exit(2);
    }

    console.log(`sendConnect via POM: ${target.name}`);
    const result = await LinkedinSearchPage.sendConnect(
        driver,
        target.profileUrl,
        target.name,
    );
    console.log("result:", result);
    console.log("back on:", await driver.getCurrentUrl());
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
