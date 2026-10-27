import { logger } from "@hammerbyte/utils";
import { toDbDateTime } from "./date.js";
import {
    acquireLinkedinProcessing,
    loginLinkedinWithCookie,
    openFirefox,
    processing,
    releaseLinkedinProcessing,
} from "./linkedin_browser.js";
import { connectMatchingPeople } from "./linkedin_connects/linkedin_crawler.js";
import {
    updateLinkedinGrowRunAccountById,
    updateLinkedinGrowRunById,
} from "../db/linkedin_grow_runs.js";

export { processing };

export function startLinkedinGrowConnects({
    runId,
    accounts = [],
    designationKeywords = [],
    perAccountLimit,
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

    if (!accountList.length || !keywords.length || !(perAccountLimit >= 1)) {
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
                    await updateLinkedinGrowRunAccountById({
                        id: account.runAccountId,
                        status: "running",
                    });

                    driver = await openFirefox();
                    await loginLinkedinWithCookie(driver, account.cookie);
                    const result = await connectMatchingPeople({
                        driver,
                        designationKeywords: keywords,
                        maxConnectsPerAccount: perAccountLimit,
                        runAccountId: account.runAccountId,
                    });

                    completedAccountCount += 1;
                    logger.info(
                        `linkedin account ${account.name} sent ${result.sent} connect request(s)`,
                    );
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    logger.error(`linkedin account ${account.name} failed: ${message}`);
                    runFailedMessage = message;
                    await updateLinkedinGrowRunAccountById({
                        id: account.runAccountId,
                        status: "failed",
                    });
                } finally {
                    if (driver) {
                        await driver.quit().catch((error) => {
                            logger.error(`linkedin driver quit failed: ${error}`);
                        });
                    }
                }
            }

            await updateLinkedinGrowRunById({
                id: runId,
                status: completedAccountCount > 0 ? "completed" : "failed",
                error_message: runFailedMessage,
                finished_on: toDbDateTime(new Date()),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`linkedin grow run failed: ${message}`);
            await updateLinkedinGrowRunById({
                id: runId,
                status: "failed",
                error_message: message,
                finished_on: toDbDateTime(new Date()),
            });
        }
    })()
        .catch((error) => {
            logger.error(`linkedin grow orchestrator failed: ${error}`);
        })
        .finally(() => {
            releaseLinkedinProcessing();
        });

    return true;
}
