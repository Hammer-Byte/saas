import { logger } from "@hammerbyte/utils";
import { getAutomationUserById } from "../../../db/automation_users.js";
import {
    updateLinkedinMessageRunAccountById,
    updateLinkedinMessageRunById,
} from "../../../db/linkedin_message_runs.js";
import { toDbDateTime } from "../../date.js";
import { loginLinkedinWithCookie } from "../../linkedin_browser.js";
import { messageNewConnections } from "../../linkedin_connects/linkedin_message_crawler.js";
import { notifyLinkedinMessageRunComplete } from "../../linkedin_notify.js";
import { openFirefox, quitDriver } from "../browser.js";
import { registerSeleniumSkipHook } from "../hooks.js";
import { registerSeleniumJobHandler } from "../registry.js";

async function start(ctx) {
    const runId = Number(ctx.payload?.runId);
    if (!(runId >= 1)) {
        throw new Error("Missing message run id");
    }
}

async function perform(ctx) {
    const perAccountLimit = Number(ctx.payload.perAccountLimit);
    const pools = (ctx.payload.designationPools || [])
        .map((pool) => ({
            name: String(pool?.name || "").trim(),
            messages: (pool?.messages || [])
                .map((message) => String(message || "").trim())
                .filter(Boolean),
        }))
        .filter((pool) => pool.name && pool.messages.length);
    const accounts = ctx.payload.accounts || [];

    if (!accounts.length || !pools.length || !(perAccountLimit >= 1)) {
        throw new Error("Invalid message job payload");
    }

    let runFailedMessage = null;
    let completedAccountCount = 0;
    let sentTotal = 0;

    for (const account of accounts) {
        if (ctx.shouldAbort()) {
            ctx.aborted = true;
            break;
        }

        const runAccountId = account.runAccountId;
        const automationUserId = account.automationUserId || account.id;
        const name = String(account.name || "").trim();
        let driver = null;

        try {
            await updateLinkedinMessageRunAccountById({
                id: runAccountId,
                status: "running",
            });

            const automationUser = await getAutomationUserById({ id: automationUserId });
            const cookie = String(automationUser?.linkedin_cookie || "").trim();
            if (!cookie) {
                throw new Error(`LinkedIn cookie missing for ${name || automationUserId}`);
            }

            driver = await openFirefox({ label: "linkedin-message" });
            ctx.setDriver(driver);
            await loginLinkedinWithCookie(driver, cookie);
            const result = await messageNewConnections({
                driver,
                designationPools: pools,
                maxMessagesPerAccount: perAccountLimit,
                runAccountId,
            });

            completedAccountCount += 1;
            sentTotal += Number(result?.sent || 0);
            logger.info(
                `linkedin message account ${name} sent ${result.sent} message(s)`,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`linkedin message account ${name} failed: ${message}`);
            runFailedMessage = message;
            await updateLinkedinMessageRunAccountById({
                id: runAccountId,
                status: "failed",
            });
        } finally {
            await quitDriver(driver, "linkedin-message");
            ctx.setDriver(null);
        }
    }

    ctx._completedAccountCount = completedAccountCount;
    ctx._runFailedMessage = runFailedMessage;
    ctx.setResultSummary(
        `${completedAccountCount}/${accounts.length} account(s), ${sentTotal} message(s)`,
    );

    if (ctx.aborted) {
        return;
    }

    if (completedAccountCount === 0 && runFailedMessage) {
        throw new Error(runFailedMessage);
    }
}

async function finish(ctx) {
    await quitDriver(ctx.getDriver(), "linkedin-message");
    ctx.setDriver(null);

    const runId = Number(ctx.payload?.runId);
    if (!(runId >= 1)) {
        return;
    }

    const completedAccountCount = Number(ctx._completedAccountCount || 0);
    let status = "completed";
    let errorMessage = null;

    if (ctx.aborted || ctx.shouldAbort()) {
        status = "failed";
        errorMessage = ctx.errorMessage || "Stopped by operator";
    } else if (ctx.errorMessage) {
        status = "failed";
        errorMessage = ctx.errorMessage;
    } else if (completedAccountCount === 0) {
        status = "failed";
        errorMessage = ctx._runFailedMessage || "No accounts completed";
    } else {
        errorMessage = ctx._runFailedMessage || null;
    }

    await updateLinkedinMessageRunById({
        id: runId,
        status,
        error_message: errorMessage,
        finished_on: toDbDateTime(new Date()),
    });

    await notifyLinkedinMessageRunComplete({ runId });
}

registerSeleniumJobHandler("linkedin_message", { start, perform, finish });

registerSeleniumSkipHook("linkedin_message", async (job) => {
    const runId = Number(job?.payload?.runId || job?.domain_run_id);
    if (!(runId >= 1)) {
        return;
    }
    await updateLinkedinMessageRunById({
        id: runId,
        status: "failed",
        error_message: "Skipped by operator",
        finished_on: toDbDateTime(new Date()),
    });
});
