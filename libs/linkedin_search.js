import { logger } from "@hammerbyte/utils";
import { toDbDateTime } from "./date.js";
import {
    acquireLinkedinProcessing,
    loginLinkedinWithCookie,
    openFirefox,
    processing,
    releaseLinkedinProcessing,
} from "./linkedin_browser.js";
import { connectPeopleFromSearch } from "./linkedin_connects/linkedin_search_crawler.js";
import {
    updateLinkedinSearchRunAccountById,
    updateLinkedinSearchRunById,
} from "../db/linkedin_search_runs.js";

export { processing };

export function startLinkedinSearchConnects({
    runId,
    accounts = [],
    designationKeywords = [],
    pageCount,
} = {}) {
    if (!acquireLinkedinProcessing()) {
        return false;
    }

    const accountList = (accounts || [])
        .map((account) => ({
            runAccountId: account?.runAccountId,
            id: account?.id,
            name: String(account?.name || "").trim(),
            cookie: String(account?.cookie || "").trim(),
        }))
        .filter((account) => account.runAccountId && account.name && account.cookie);

    const keywords = (designationKeywords || [])
        .map((keyword) => String(keyword || "").trim())
        .filter(Boolean);

    if (!accountList.length || !keywords.length || !(pageCount >= 1)) {
        releaseLinkedinProcessing();
        return false;
    }

    (async () => {
        let runFailedMessage = null;
        let completedAccountCount = 0;

        try {
            for (const account of accountList) {
                let driver = null;

                try {
                    await updateLinkedinSearchRunAccountById({
                        id: account.runAccountId,
                        status: "running",
                    });

                    driver = await openFirefox();
                    await loginLinkedinWithCookie(driver, account.cookie);
                    const result = await connectPeopleFromSearch({
                        driver,
                        designationKeywords: keywords,
                        pageCount,
                        runAccountId: account.runAccountId,
                    });

                    completedAccountCount += 1;
                    logger.info(
                        `linkedin search account ${account.name} sent ${result.sent} connect request(s)`,
                    );
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    logger.error(`linkedin search account ${account.name} failed: ${message}`);
                    runFailedMessage = message;
                    await updateLinkedinSearchRunAccountById({
                        id: account.runAccountId,
                        status: "failed",
                    });
                } finally {
                    if (driver) {
                        await driver.quit().catch((error) => {
                            logger.error(`linkedin search driver quit failed: ${error}`);
                        });
                    }
                }
            }

            await updateLinkedinSearchRunById({
                id: runId,
                status: completedAccountCount > 0 ? "completed" : "failed",
                error_message: runFailedMessage,
                finished_on: toDbDateTime(new Date()),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`linkedin search run failed: ${message}`);
            await updateLinkedinSearchRunById({
                id: runId,
                status: "failed",
                error_message: message,
                finished_on: toDbDateTime(new Date()),
            });
        }
    })()
        .catch((error) => {
            logger.error(`linkedin search orchestrator failed: ${error}`);
        })
        .finally(() => {
            releaseLinkedinProcessing();
        });

    return true;
}
