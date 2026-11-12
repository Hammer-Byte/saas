import { logger } from "@hammerbyte/utils";
import {
    claimNextQueuedSeleniumJob,
    createSeleniumJob,
    getSeleniumJobById,
    recoverStaleSeleniumJobs,
    updateSeleniumJobById,
} from "../../db/selenium_jobs.js";
import {
    ensureSeleniumPipelineState,
    getSeleniumPipelineState,
} from "../../db/selenium_pipeline_state.js";
import { toDbDateTime } from "../date.js";
import { createSeleniumJobContext } from "./context.js";
import { recoverStaleContentPublishRuns } from "../../db/content_publish_runs.js";
import { getSeleniumSkipHook } from "./hooks.js";
import { getSeleniumJobHandler } from "./registry.js";
import "./jobs/register.js";

/** In-memory abort flags for running jobs (jobId → true). */
const abortFlags = new Map();

/** Active in-process worker count. */
let activeWorkers = 0;
let kicking = false;
let needsKick = false;
let bootstrapped = false;

export function requestSeleniumJobAbort(jobId) {
    const id = Number(jobId);
    if (!(id >= 1)) {
        return false;
    }
    abortFlags.set(id, true);
    return true;
}

export function clearSeleniumJobAbort(jobId) {
    abortFlags.delete(Number(jobId));
}

export function isSeleniumJobAbortRequested(jobId) {
    return !!abortFlags.get(Number(jobId));
}

export function getSeleniumActiveWorkerCount() {
    return activeWorkers;
}

async function runJob(job) {
    const handler = getSeleniumJobHandler(job.type);
    if (!handler) {
        await updateSeleniumJobById({
            id: job.id,
            status: "failed",
            error_message: `No handler registered for type ${job.type}`,
            finished_on: toDbDateTime(new Date()),
        });
        return;
    }

    await updateSeleniumJobById({
        id: job.id,
        status: "running",
        started_on: toDbDateTime(new Date()),
        error_message: null,
    });

    const ctx = createSeleniumJobContext({
        job,
        shouldAbort: () => isSeleniumJobAbortRequested(job.id),
    });

    let finalStatus = "completed";

    try {
        await handler.start(ctx);
        if (ctx.shouldAbort()) {
            ctx.aborted = true;
            finalStatus = "stopped";
        } else {
            await handler.perform(ctx);
            if (ctx.shouldAbort()) {
                ctx.aborted = true;
                finalStatus = "stopped";
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`selenium job ${job.id} (${job.type}) failed: ${message}`);
        ctx.setErrorMessage(message);
        finalStatus = ctx.shouldAbort() ? "stopped" : "failed";
    }

    try {
        await handler.finish(ctx);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`selenium job ${job.id} finish failed: ${message}`);
        if (!ctx.errorMessage) {
            ctx.setErrorMessage(message);
        }
        if (finalStatus === "completed") {
            finalStatus = "failed";
        }
    }

    clearSeleniumJobAbort(job.id);

    await updateSeleniumJobById({
        id: job.id,
        status: finalStatus,
        result_summary: ctx.resultSummary,
        error_message:
            finalStatus === "completed" ? null : ctx.errorMessage || (finalStatus === "stopped" ? "Stopped by operator" : null),
        finished_on: toDbDateTime(new Date()),
    });
}

async function fillWorkers() {
    if (kicking) {
        needsKick = true;
        return;
    }
    kicking = true;
    needsKick = false;

    try {
        while (true) {
            const state = await getSeleniumPipelineState();
            if (!state || state.paused) {
                break;
            }

            const maxParallel = Math.max(1, Number(state.max_parallel) || 1);
            if (activeWorkers >= maxParallel) {
                break;
            }

            const job = await claimNextQueuedSeleniumJob();
            if (!job) {
                break;
            }

            activeWorkers += 1;
            (async () => {
                try {
                    await runJob(job);
                } catch (error) {
                    logger.error(`selenium worker crashed: ${error}`);
                } finally {
                    activeWorkers = Math.max(0, activeWorkers - 1);
                    kickSeleniumPipeline();
                }
            })();
        }
    } finally {
        kicking = false;
        if (needsKick) {
            kickSeleniumPipeline();
        }
    }
}

export function kickSeleniumPipeline() {
    fillWorkers().catch((error) => {
        logger.error(`kickSeleniumPipeline: ${error}`);
    });
}

export async function enqueueSeleniumJob({
    type,
    source,
    title,
    payload = null,
    created_by = null,
    domain_run_id = null,
}) {
    const jobId = await createSeleniumJob({
        type,
        source,
        title,
        payload,
        created_by,
        domain_run_id,
        status: "queued",
    });

    if (!jobId) {
        return null;
    }

    kickSeleniumPipeline();
    return await getSeleniumJobById({ id: jobId });
}

export async function skipSeleniumJob({ id }) {
    const job = await getSeleniumJobById({ id });
    if (!job) {
        return { error: "Job not found", status: 404 };
    }
    if (String(job.status) !== "queued") {
        return { error: "Only queued jobs can be skipped", status: 409 };
    }

    await updateSeleniumJobById({
        id: job.id,
        status: "skipped",
        error_message: "Skipped by operator",
        finished_on: toDbDateTime(new Date()),
    });

    const hook = getSeleniumSkipHook(job.type);
    if (typeof hook === "function") {
        try {
            await hook(job);
        } catch (error) {
            logger.error(`selenium skip hook for job ${job.id}: ${error}`);
        }
    }

    return { job: await getSeleniumJobById({ id: job.id }) };
}

export async function stopSeleniumJob({ id }) {
    const job = await getSeleniumJobById({ id });
    if (!job) {
        return { error: "Job not found", status: 404 };
    }
    if (String(job.status) !== "running") {
        return { error: "Only running jobs can be stopped", status: 409 };
    }

    requestSeleniumJobAbort(job.id);
    return { job, message: "Stop requested" };
}

export async function initSeleniumPipeline() {
    if (bootstrapped) {
        kickSeleniumPipeline();
        return;
    }
    bootstrapped = true;

    const envParallel = Number(Bun.env.SELENIUM_MAX_PARALLEL);
    const maxParallel =
        Number.isFinite(envParallel) && envParallel >= 1 ? Math.floor(envParallel) : 1;

    await ensureSeleniumPipelineState({
        paused: false,
        max_parallel: maxParallel,
    });
    const finishedOn = toDbDateTime(new Date());
    await recoverStaleSeleniumJobs({ finished_on: finishedOn });
    await recoverStaleContentPublishRuns({ finished_on: finishedOn });
    kickSeleniumPipeline();
}
