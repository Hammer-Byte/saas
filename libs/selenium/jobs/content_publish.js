import { join } from "node:path";
import { logger } from "@hammerbyte/utils";
import { getAutomationUserById } from "../../../db/automation_users.js";
import {
    getContentPublishRunById,
    getContentPublishRunTargetsByRunId,
    updateContentPublishRunById,
} from "../../../db/content_publish_runs.js";
import { getMediaById } from "../../../db/media.js";
import { executeContentPublishRun } from "../../content_publish.js";
import { toDbDateTime } from "../../date.js";
import { registerSeleniumSkipHook } from "../hooks.js";
import { registerSeleniumJobHandler } from "../registry.js";

/** Ephemeral creds for application-source runs (not persisted). */
const pendingSecrets = new Map();

const PLATFORM_COOKIE = {
    instagram: "instagram_cookie",
    youtube: "youtube_cookie",
    linkedin: "linkedin_cookie",
};

export function storeContentPublishSecrets(runId, payload) {
    pendingSecrets.set(Number(runId), payload);
}

function takeContentPublishSecrets(runId) {
    const key = Number(runId);
    const payload = pendingSecrets.get(key) || null;
    pendingSecrets.delete(key);
    return payload;
}

function parseRunOptions(run) {
    if (!run?.run_options) {
        return {};
    }
    if (typeof run.run_options === "object") {
        return run.run_options;
    }
    try {
        return JSON.parse(String(run.run_options));
    } catch {
        return {};
    }
}

async function rebuildWebsitePayload(run) {
    const media = await getMediaById({ id: run.media_id });
    if (!media?.file) {
        throw new Error("Media not found for queued run");
    }
    if (!run.automation_user_id) {
        throw new Error("Automation user missing for queued website run");
    }
    const automationUser = await getAutomationUserById({ id: run.automation_user_id });
    if (!automationUser) {
        throw new Error("Automation user not found for queued run");
    }

    const dbTargets = await getContentPublishRunTargetsByRunId({ run_id: run.id });
    const options = parseRunOptions(run);
    const targets = [];

    for (const target of dbTargets) {
        const platform = String(target.platform || "").trim();
        const cookieField = PLATFORM_COOKIE[platform];
        if (!cookieField) {
            continue;
        }
        const cookie = String(automationUser[cookieField] || "").trim();
        if (!cookie) {
            throw new Error(`Automation user missing ${platform} credentials`);
        }
        targets.push({
            targetId: target.id,
            platform,
            cookie,
            youtubeChannelId:
                platform === "youtube"
                    ? options.youtube_channel_id || automationUser.youtube_channel_id || null
                    : null,
            linkedinCompanyId:
                platform === "linkedin"
                    ? options.linkedin_company_id || automationUser.linkedin_company_id || null
                    : null,
            instagramUserId:
                platform === "instagram"
                    ? options.instagram_user_id || automationUser.instagram_user_id || null
                    : null,
        });
    }

    if (!targets.length) {
        throw new Error("No valid targets for queued run");
    }

    return {
        runId: run.id,
        mediaPath: join(Bun.env.DIRECTORY_MEDIA, media.file),
        mediaId: media.id,
        targets,
        instagramCaption: run.instagram_caption,
        youtubeTitle: run.youtube_title,
        youtubeDescription: run.youtube_description,
        linkedinCaption: run.linkedin_caption,
        mediaKind: run.media_kind || "image",
        instagramDestinations: Array.isArray(options.instagram_destinations)
            && options.instagram_destinations.length
            ? options.instagram_destinations
            : [options.instagram_destination || "feed"],
        youtubeDestination:
            options.youtube_destination
            || (run.media_kind === "video" ? "shorts" : "community"),
    };
}

async function resolveExecutePayload(run) {
    const cached = takeContentPublishSecrets(run.id);
    if (cached) {
        return cached;
    }
    if (String(run.source || "") === "application") {
        throw new Error(
            "External run credentials were lost (server restart). Re-submit the publish request.",
        );
    }
    return rebuildWebsitePayload(run);
}

async function start(ctx) {
    const runId = Number(ctx.payload?.runId);
    if (!(runId >= 1)) {
        throw new Error("Missing content publish run id");
    }

    const run = await getContentPublishRunById({ id: runId });
    if (!run) {
        throw new Error("Content publish run not found");
    }

    await updateContentPublishRunById({
        id: runId,
        status: "running",
    });

    ctx._executePayload = await resolveExecutePayload(run);
}

async function perform(ctx) {
    if (ctx.shouldAbort()) {
        ctx.aborted = true;
        throw new Error("Stopped by operator");
    }
    await executeContentPublishRun(ctx._executePayload);

    const runId = Number(ctx.payload?.runId);
    const run = runId >= 1 ? await getContentPublishRunById({ id: runId }) : null;
    const domainStatus = String(run?.status || "").toLowerCase();
    if (domainStatus === "failed") {
        throw new Error(run?.error_message || "Content publish failed");
    }
    ctx.setResultSummary(
        domainStatus === "completed"
            ? "Content publish completed"
            : `Content publish finished (${domainStatus || "unknown"})`,
    );
}

async function finish(ctx) {
    const runId = Number(ctx.payload?.runId);
    if (!(runId >= 1)) {
        return;
    }

    if (ctx.aborted || ctx.shouldAbort() || ctx.errorMessage) {
        const run = await getContentPublishRunById({ id: runId });
        if (run && ["queued", "running"].includes(String(run.status || "").toLowerCase())) {
            await updateContentPublishRunById({
                id: runId,
                status: "failed",
                error_message: ctx.errorMessage || "Stopped by operator",
                finished_on: toDbDateTime(new Date()),
            });
        }
    }
}

registerSeleniumJobHandler("content_publish", { start, perform, finish });

registerSeleniumSkipHook("content_publish", async (job) => {
    const runId = Number(job?.payload?.runId || job?.domain_run_id);
    if (!(runId >= 1)) {
        return;
    }
    takeContentPublishSecrets(runId);
    await updateContentPublishRunById({
        id: runId,
        status: "failed",
        error_message: "Skipped by operator",
        finished_on: toDbDateTime(new Date()),
    });
    logger.info(`content_publish skip marked domain run ${runId} failed`);
});
