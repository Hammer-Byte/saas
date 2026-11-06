import { join } from "node:path";
import { logger } from "@hammerbyte/utils";
import {
    claimNextQueuedContentPublishRun,
    getContentPublishRunTargetsByRunId,
    recoverStaleContentPublishRuns,
    updateContentPublishRunById,
} from "../db/content_publish_runs.js";
import { getAutomationUserById } from "../db/automation_users.js";
import { getMediaById } from "../db/media.js";
import { toDbDateTime } from "./date.js";
import {
    acquireContentPublishProcessing,
    releaseContentPublishProcessing,
} from "./content_publish_browser.js";
import { executeContentPublishRun } from "./content_publish.js";

/** Ephemeral payloads (creds + captions) keyed by run id — not persisted. */
const pendingPayloads = new Map();

const PLATFORM_COOKIE = {
    instagram: "instagram_cookie",
    youtube: "youtube_cookie",
    linkedin: "linkedin_cookie",
};

let draining = false;
let needsRescan = false;
let bootstrapped = false;

function storePayload(runId, payload) {
    pendingPayloads.set(Number(runId), payload);
}

function takePayload(runId) {
    const key = Number(runId);
    const payload = pendingPayloads.get(key) || null;
    pendingPayloads.delete(key);
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

async function resolvePayload(run) {
    const cached = takePayload(run.id);
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

export function kickContentPublishWorker() {
    if (draining) {
        needsRescan = true;
        return;
    }
    if (!acquireContentPublishProcessing()) {
        needsRescan = true;
        return;
    }

    draining = true;
    needsRescan = false;

    (async () => {
        try {
            while (true) {
                const run = await claimNextQueuedContentPublishRun();
                if (!run) {
                    break;
                }
                logger.info(
                    `content-publish queue claimed run=${run.id} source=${run.source} kind=${run.media_kind}`,
                );
                try {
                    const payload = await resolvePayload(run);
                    await executeContentPublishRun(payload);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    logger.error(
                        `content-publish queue run=${run.id} failed before execute: ${message}`,
                    );
                    await updateContentPublishRunById({
                        id: run.id,
                        status: "failed",
                        error_message: message,
                        finished_on: toDbDateTime(new Date()),
                    });
                }
            }
        } catch (error) {
            logger.error(`content-publish queue worker crashed: ${error}`);
        } finally {
            draining = false;
            releaseContentPublishProcessing();
            logger.info("content-publish queue worker idle");
            if (needsRescan) {
                needsRescan = false;
                kickContentPublishWorker();
            }
        }
    })();
}

/**
 * Enqueue a prepared payload and start the worker if idle.
 * Run row must already exist with status=queued and targets created.
 */
export function enqueueContentPublishRun(runId, payload) {
    storePayload(runId, {
        ...payload,
        runId: Number(runId),
    });
    logger.info(`content-publish queue enqueued run=${runId}`);
    kickContentPublishWorker();
}

/** Call once at process boot after DB tables are ready. */
export async function initContentPublishQueue() {
    if (bootstrapped) {
        return;
    }
    bootstrapped = true;
    await recoverStaleContentPublishRuns({ finished_on: toDbDateTime(new Date()) });
    logger.info("content-publish queue recovered stale runs after restart");
    kickContentPublishWorker();
}
