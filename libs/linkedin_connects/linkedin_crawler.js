import { logger } from "@hammerbyte/utils";
import { LinkedinGrowPage, designationMatches } from "./linkedin_pom.js";
import { updateLinkedinGrowRunAccountById } from "../../db/linkedin_grow_runs.js";

const MAX_SCROLLS = 5;
const SCROLL_WAIT_MS = 5000;
const DELAY_MS = 5000;

export async function connectMatchingPeople({
    driver,
    designationKeywords,
    maxConnectsPerAccount,
    runAccountId,
}) {
    await LinkedinGrowPage.open(driver);
    await LinkedinGrowPage.waitForInviteButtons(driver);
    await LinkedinGrowPage.sleep(1000);
    await LinkedinGrowPage.ensureGrowPage(driver);

    const seen = new Set();
    let sent = 0;
    let accountStatus = "completed";

    for (let pass = 0; pass <= MAX_SCROLLS && sent < maxConnectsPerAccount; pass++) {
        let foundNewCard = false;

        while (sent < maxConnectsPerAccount) {
            const cards = await LinkedinGrowPage.readCards(driver);
            const next = cards.find((card) => card.profileUrl && !seen.has(card.profileUrl));
            if (!next) {
                break;
            }

            seen.add(next.profileUrl);
            foundNewCard = true;

            if (!designationMatches(next.designation, designationKeywords)) {
                logger.info(
                    `linkedin skip ${next.name || "unknown"} — ${next.designation || "no designation"}`,
                );
                continue;
            }
            if (!next.canConnect) {
                logger.info(`linkedin skip ${next.name} — no Connect button`);
                continue;
            }

            const result = await LinkedinGrowPage.sendConnect(driver, next.profileUrl, next.name);
            if (result === "limit") {
                logger.info("linkedin invitation limit reached for this account");
                accountStatus = "limit";
                await updateLinkedinGrowRunAccountById({
                    id: runAccountId,
                    sent_count: sent,
                    status: accountStatus,
                });
                return { sent, status: accountStatus };
            }
            if (result === "skipped") {
                logger.info(`linkedin skip ${next.name} — connect dialog could not be sent`);
                continue;
            }

            sent += 1;
            logger.info(
                `linkedin sent ${next.name} — ${next.designation} (${sent}/${maxConnectsPerAccount})`,
            );
            await updateLinkedinGrowRunAccountById({
                id: runAccountId,
                sent_count: sent,
                status: "running",
            });
            await LinkedinGrowPage.sleep(DELAY_MS);
        }

        if (!foundNewCard && seen.size === 0 && pass === 0) {
            logger.info(`linkedin no people cards at ${await driver.getCurrentUrl()}`);
            break;
        }

        if (pass === MAX_SCROLLS || sent >= maxConnectsPerAccount) {
            break;
        }

        logger.info(
            `linkedin scroll ${pass + 1}/${MAX_SCROLLS} — waiting ${SCROLL_WAIT_MS / 1000}s for more people`,
        );
        await LinkedinGrowPage.scrollGrowPage(driver);
        await LinkedinGrowPage.sleep(SCROLL_WAIT_MS);
    }

    await updateLinkedinGrowRunAccountById({
        id: runAccountId,
        sent_count: sent,
        status: accountStatus,
    });

    return { sent, status: accountStatus };
}
