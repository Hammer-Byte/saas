/**
 * Live-test LinkedIn connect paths used by grow + search.
 *
 * LI_AT_FILE=/path/to/cookie bun scripts/live_test_linkedin_connect_paths.js
 *
 * Optional:
 *   FALLBACK_PROFILE_URL=https://www.linkedin.com/in/...  (forces profile helper test)
 *   SEARCH_KEYWORD=CEO
 *
 * Sends real invitations on success.
 */
import {
    linkedinSleep,
    loginLinkedinWithCookie,
    openFirefox,
} from "../libs/linkedin_browser.js";
import { connectViaProfileMoreMenu } from "../libs/linkedin_connects/linkedin_invite.js";
import { LinkedinSearchPage } from "../libs/linkedin_connects/linkedin_search_pom.js";
import { LinkedinGrowPage } from "../libs/linkedin_connects/linkedin_pom.js";

const cookieFile = String(Bun.env.LI_AT_FILE || "").trim();
const cookie = String(
    Bun.env.LI_AT || (cookieFile ? await Bun.file(cookieFile).text() : ""),
).trim();
const searchKeyword = String(Bun.env.SEARCH_KEYWORD || "CEO").trim();
const fallbackProfileUrl = String(Bun.env.FALLBACK_PROFILE_URL || "").trim();

if (!cookie) {
    console.error("Set LI_AT or LI_AT_FILE");
    process.exit(1);
}

const results = [];
const okResult = (result) => result === "sent" || result === "limit";

function record(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

let driver = null;
try {
    driver = await openFirefox();
    await loginLinkedinWithCookie(driver, cookie);
    console.log("login ok:", await driver.getCurrentUrl());

    // --- Search classification + both send paths when available ---
    await LinkedinSearchPage.openPeopleSearch(driver, searchKeyword);
    await LinkedinSearchPage.waitForResults(driver);
    await LinkedinSearchPage.hydrateInviteLinks(driver);
    const cards = await LinkedinSearchPage.readCards(driver);
    console.log(
        "search sample:",
        cards.slice(0, 8).map((card) => ({
            name: card.name,
            path: card.connectPath,
            can: card.canConnect,
        })),
    );

    const direct = cards.find((card) => card.canConnect && card.connectPath === "invite");
    const fallback = cards.find((card) => card.canConnect && card.connectPath === "profile");

    if (direct) {
        const result = await LinkedinSearchPage.sendConnect(
            driver,
            direct.profileUrl,
            direct.name,
        );
        record("search-direct-connect", okResult(result), `${direct.name} → ${result}`);
        await linkedinSleep(1200);
    } else {
        record("search-direct-connect", false, "no invite-path card in this result set");
    }

    if (fallback) {
        const result = await LinkedinSearchPage.sendConnect(
            driver,
            fallback.profileUrl,
            fallback.name,
        );
        record("search-profile-fallback", okResult(result), `${fallback.name} → ${result}`);
        await linkedinSleep(1200);
    } else if (fallbackProfileUrl) {
        const result = await connectViaProfileMoreMenu(
            driver,
            fallbackProfileUrl,
            "fallback-profile",
            "https://www.linkedin.com/feed/",
        );
        record(
            "search-profile-fallback",
            okResult(result),
            `${fallbackProfileUrl} → ${result}`,
        );
    } else {
        record(
            "search-profile-fallback",
            false,
            "no follow-only card; set FALLBACK_PROFILE_URL to force",
        );
    }

    // --- Grow ---
    await LinkedinGrowPage.open(driver);
    await LinkedinGrowPage.waitForInviteButtons(driver);
    await LinkedinGrowPage.sleep(800);
    await LinkedinGrowPage.ensureGrowPage(driver);
    const growCards = await LinkedinGrowPage.readCards(driver);
    const growTarget = growCards.find((card) => card.canConnect);
    console.log(
        "grow sample:",
        growCards.slice(0, 5).map((card) => ({ name: card.name, can: card.canConnect })),
    );

    if (growTarget) {
        const result = await LinkedinGrowPage.sendConnect(
            driver,
            growTarget.profileUrl,
            growTarget.name,
        );
        record(
            "grow-direct-or-fallback",
            okResult(result),
            `${growTarget.name} → ${result}`,
        );
    } else {
        record("grow-direct-or-fallback", false, "no connectable grow card");
    }
} catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
} finally {
    if (driver) {
        await driver.quit().catch(() => undefined);
    }
}

console.log("\n=== summary ===");
console.log(JSON.stringify(results, null, 2));

const passed = results.filter((row) => row.ok).map((row) => row.name);
const growOk = passed.includes("grow-direct-or-fallback");
const searchOk =
    passed.includes("search-direct-connect") || passed.includes("search-profile-fallback");
process.exit(growOk && searchOk ? 0 : 3);
