import { logger } from "@hammerbyte/utils";
import { toDbDateTime } from "./date.js";
import {
    acquireLinkedinProcessing,
    loginLinkedinWithCookie,
    openFirefox,
    processing,
    releaseLinkedinProcessing,
} from "./linkedin_browser.js";
import { messageNewConnections } from "./linkedin_connects/linkedin_message_crawler.js";
import {
    updateLinkedinMessageRunAccountById,
    updateLinkedinMessageRunById,
} from "../db/linkedin_message_runs.js";
import { notifyLinkedinMessageRunComplete } from "./linkedin_notify.js";

export { processing };

export function startLinkedinMessageConnects({
    runId,
    accounts = [],
    designationPools = [],
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

    const pools = (designationPools || [])
        .map((pool) => ({
            name: String(pool?.name || "").trim(),
            messages: (pool?.messages || [])
                .map((message) => String(message || "").trim())
                .filter(Boolean),
        }))
        .filter((pool) => pool.name && pool.messages.length);

    if (!accountList.length || !pools.length || !(perAccountLimit >= 1)) {
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
                    await updateLinkedinMessageRunAccountById({
                        id: account.runAccountId,
                        status: "running",
                    });

                    driver = await openFirefox();
                    await loginLinkedinWithCookie(driver, account.cookie);
                    const result = await messageNewConnections({
                        driver,
                        designationPools: pools,
                        maxMessagesPerAccount: perAccountLimit,
                        runAccountId: account.runAccountId,
                    });

                    completedAccountCount += 1;
                    logger.info(
                        `linkedin account ${account.name} sent ${result.sent} message(s)`,
                    );
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    logger.error(`linkedin account ${account.name} failed: ${message}`);
                    runFailedMessage = message;
                    await updateLinkedinMessageRunAccountById({
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

            await updateLinkedinMessageRunById({
                id: runId,
                status: completedAccountCount > 0 ? "completed" : "failed",
                error_message: runFailedMessage,
                finished_on: toDbDateTime(new Date()),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`linkedin message run failed: ${message}`);
            await updateLinkedinMessageRunById({
                id: runId,
                status: "failed",
                error_message: message,
                finished_on: toDbDateTime(new Date()),
            });
        }

        await notifyLinkedinMessageRunComplete({ runId });
    })()
        .catch((error) => {
            logger.error(`linkedin message orchestrator failed: ${error}`);
        })
        .finally(() => {
            releaseLinkedinProcessing();
        });

    return true;
}
