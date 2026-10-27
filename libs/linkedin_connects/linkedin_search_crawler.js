import { logger } from "@hammerbyte/utils";
import { LinkedinSearchPage } from "./linkedin_search_pom.js";
import { updateLinkedinSearchRunAccountById } from "../../db/linkedin_search_runs.js";

const DELAY_MS = 5000;

export async function connectPeopleFromSearch({
    driver,
    designationKeywords,
    maxConnectsPerAccount,
    pageCount,
    runAccountId,
}) {
    let sent = 0;
    let accountStatus = "completed";
    const seen = new Set();

    for (const keyword of designationKeywords) {
        if (sent >= maxConnectsPerAccount) {
            break;
        }

        logger.info(`linkedin search opening people results for "${keyword}"`);
        await LinkedinSearchPage.openPeopleSearch(driver, keyword);
        await LinkedinSearchPage.waitForResults(driver);
        await LinkedinSearchPage.sleep(1000);

        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
            if (sent >= maxConnectsPerAccount) {
                break;
            }

            logger.info(
                `linkedin search "${keyword}" page ${pageNumber}/${pageCount}`,
            );

            while (sent < maxConnectsPerAccount) {
                const cards = await LinkedinSearchPage.readCards(driver);
                const next = cards.find(
                    (card) => card.profileUrl && !seen.has(card.profileUrl),
                );
                if (!next) {
                    break;
                }

                seen.add(next.profileUrl);

                if (!next.canConnect) {
                    logger.info(`linkedin search skip ${next.name || "unknown"} — no Connect button`);
                    continue;
                }

                const result = await LinkedinSearchPage.sendConnect(
                    driver,
                    next.profileUrl,
                    next.name,
                );
                if (result === "limit") {
                    logger.info("linkedin search invitation limit reached for this account");
                    accountStatus = "limit";
                    await updateLinkedinSearchRunAccountById({
                        id: runAccountId,
                        sent_count: sent,
                        status: accountStatus,
                    });
                    return { sent, status: accountStatus };
                }
                if (result === "skipped") {
                    logger.info(
                        `linkedin search skip ${next.name || "unknown"} — connect dialog could not be sent`,
                    );
                    continue;
                }

                sent += 1;
                logger.info(
                    `linkedin search sent ${next.name || "unknown"} (${sent}/${maxConnectsPerAccount})`,
                );
                await updateLinkedinSearchRunAccountById({
                    id: runAccountId,
                    sent_count: sent,
                    status: "running",
                });
                await LinkedinSearchPage.sleep(DELAY_MS);
            }

            if (pageNumber >= pageCount || sent >= maxConnectsPerAccount) {
                break;
            }

            const moved = await LinkedinSearchPage.goToNextPage(driver);
            if (!moved) {
                logger.info(`linkedin search no next page for "${keyword}" after page ${pageNumber}`);
                break;
            }
        }
    }

    await updateLinkedinSearchRunAccountById({
        id: runAccountId,
        sent_count: sent,
        status: accountStatus,
    });

    return { sent, status: accountStatus };
}
