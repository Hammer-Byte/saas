import { join } from "node:path";
import { filer, logger } from "@hammerbyte/utils";
import { getAutomationUserById } from "../db/automation_users.js";
import { createMedia, getMediaById } from "../db/media.js";
import {
    createContentPublishRun,
    createContentPublishRunTarget,
    getAllContentPublishRunTargets,
    getAllContentPublishRuns,
    getContentPublishRunById,
    getContentPublishRunByIdForApplication,
    getContentPublishRunStatusCounts,
    getContentPublishRunTargetsByRunId,
} from "../db/content_publish_runs.js";
import { processing } from "../libs/content_publish_browser.js";
import { enqueueContentPublishRun } from "../libs/content_publish_queue.js";
import { resolveContentPublishPublicMediaFile } from "../libs/content_publish_public_media.js";
import { resolveContentPublishScreenshotPath } from "../libs/content_publish_screenshot.js";
import { getCurrentUser } from "./authentication.js";

const PLATFORM_COOKIE = {
    instagram: "instagram_cookie",
    youtube: "youtube_cookie",
    linkedin: "linkedin_cookie",
};

const SUPPORTED_PLATFORMS = new Set(["instagram", "youtube", "linkedin"]);

const IMAGE_EXTENSIONS = new Set([
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "bmp",
]);

const VIDEO_EXTENSIONS = new Set([
    "mp4",
    "mov",
    "webm",
    "m4v",
]);

function mediaExtension(media) {
    const name = String(media?.file || media?.name || "");
    return name.includes(".") ? name.split(".").pop().toLowerCase() : "";
}

function isImageMedia(media) {
    return IMAGE_EXTENSIONS.has(mediaExtension(media));
}

function isVideoMedia(media) {
    return VIDEO_EXTENSIONS.has(mediaExtension(media));
}

function detectMediaKind(media) {
    if (isImageMedia(media)) {
        return "image";
    }
    if (isVideoMedia(media)) {
        return "video";
    }
    return null;
}

function trimOrNull(value) {
    const text = String(value || "").trim();
    return text || null;
}

function normalizeYoutubeChannelId(value) {
    const text = String(value || "").trim();
    if (!text) {
        return null;
    }
    const fromUrl = text.match(/channel\/(UC[\w-]+)/i);
    if (fromUrl) {
        return fromUrl[1];
    }
    if (/^UC[\w-]+$/i.test(text)) {
        return text;
    }
    return null;
}

function normalizeLinkedinCompanyId(value) {
    const text = String(value || "").trim();
    if (!text) {
        return null;
    }
    const fromUrl = text.match(/company\/(\d+)(?:\/|$)/i);
    if (fromUrl) {
        return fromUrl[1];
    }
    if (/^\d+$/.test(text)) {
        return text;
    }
    return null;
}

function normalizeInstagramUserId(value) {
    const text = String(value || "").trim();
    if (!text) {
        return null;
    }
    if (/^\d{5,}$/.test(text)) {
        return text;
    }
    const fromQuery = text.match(/[?&](?:ig_user_id|instagram_business_account)(?:=|%3D)(\d+)/i);
    if (fromQuery) {
        return fromQuery[1];
    }
    const digits = text.match(/\b(\d{5,})\b/);
    return digits ? digits[1] : null;
}

function parsePlatforms(raw) {
    if (Array.isArray(raw)) {
        return [...new Set(raw.map((platform) => String(platform).trim()).filter(Boolean))];
    }
    const text = String(raw || "").trim();
    if (!text) {
        return [];
    }
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
            return [...new Set(parsed.map((platform) => String(platform).trim()).filter(Boolean))];
        }
    } catch {
        // comma-separated
    }
    return [...new Set(text.split(",").map((part) => part.trim()).filter(Boolean))];
}

function normalizeInstagramDestinations(body) {
    const allowed = new Set(["feed", "story"]);
    const raw = body?.instagram_destinations ?? body?.instagram_destination;
    let list = [];
    if (Array.isArray(raw)) {
        list = raw.map((item) => String(item || "").trim().toLowerCase());
    } else if (raw != null && String(raw).trim()) {
        const text = String(raw).trim();
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                list = parsed.map((item) => String(item || "").trim().toLowerCase());
            } else {
                list = text.split(/[,\s]+/).map((part) => part.trim().toLowerCase());
            }
        } catch {
            list = text.split(/[,\s]+/).map((part) => part.trim().toLowerCase());
        }
    }
    const destinations = [...new Set(list.filter((item) => allowed.has(item)))];
    return destinations.length ? destinations : ["feed"];
}

export function parseContentPublishRunOptions(run) {
    let options = {};
    const raw = run?.run_options;
    if (raw && typeof raw === "object") {
        options = raw;
    } else if (raw != null && String(raw).trim()) {
        try {
            options = JSON.parse(String(raw));
        } catch {
            options = {};
        }
    }
    const allowedIg = new Set(["feed", "story"]);
    let instagram_destinations = [];
    if (Array.isArray(options.instagram_destinations)) {
        instagram_destinations = [
            ...new Set(
                options.instagram_destinations
                    .map((item) => String(item || "").trim().toLowerCase())
                    .filter((item) => allowedIg.has(item)),
            ),
        ];
    } else if (options.instagram_destination) {
        const single = String(options.instagram_destination).trim().toLowerCase();
        if (allowedIg.has(single)) {
            instagram_destinations = [single];
        }
    }
    const youtube_destination = options.youtube_destination
        ? String(options.youtube_destination).trim().toLowerCase()
        : null;
    return {
        ...options,
        instagram_destinations,
        youtube_destination,
    };
}

export function decorateContentPublishRun(run) {
    if (!run) {
        return run;
    }
    const options = parseContentPublishRunOptions(run);
    return {
        ...run,
        run_options: options,
        instagram_destinations: options.instagram_destinations,
        youtube_destination: options.youtube_destination,
    };
}

function validatePublishFields({
    platforms,
    mediaKind,
    instagram_caption,
    instagram_user_id,
    instagram_destinations,
    youtube_title,
    youtube_channel_id,
    youtube_destination,
    linkedin_caption,
    linkedin_company_id,
}) {
    if (!platforms.length) {
        return "Select at least one platform (instagram, youtube, linkedin)";
    }
    for (const platform of platforms) {
        if (!SUPPORTED_PLATFORMS.has(platform)) {
            return `Unsupported platform: ${platform}`;
        }
    }
    if (platforms.includes("instagram") && !instagram_user_id) {
        return "Instagram user id is required (Graph IG professional account id)";
    }
    if (platforms.includes("instagram") && !instagram_destinations?.length) {
        return "Select at least one Instagram destination (feed and/or story)";
    }
    if (platforms.includes("instagram")) {
        for (const destination of instagram_destinations) {
            if (!["feed", "story"].includes(destination)) {
                return "Instagram destination must be feed or story";
            }
        }
    }
    // Feed posts need a caption; Stories use the media only (Graph STORIES has no caption).
    if (
        platforms.includes("instagram")
        && instagram_destinations.includes("feed")
        && !instagram_caption
    ) {
        return "Instagram caption is required for feed posts";
    }
    if (platforms.includes("youtube") && !youtube_title) {
        return "YouTube title is required";
    }
    if (platforms.includes("youtube") && !youtube_channel_id) {
        return "YouTube channel id (UC… or channel URL) is required";
    }
    if (platforms.includes("youtube") && mediaKind === "video" && youtube_destination !== "shorts") {
        return "YouTube video destination must be shorts";
    }
    if (
        platforms.includes("youtube")
        && mediaKind === "image"
        && youtube_destination !== "community"
    ) {
        return "YouTube image destination must be community";
    }
    if (platforms.includes("linkedin") && !linkedin_caption) {
        return "LinkedIn caption is required";
    }
    if (platforms.includes("linkedin") && !linkedin_company_id) {
        return "LinkedIn page / company id is required";
    }
    return null;
}

export async function getContentPublishStatus({ set }) {
    const counts = await getContentPublishRunStatusCounts();
    set.status = 200;
    return { processing, queue: counts };
}

export async function startContentPublishRun({ body, set, cookie }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized", processing: false };
    }

    const media = await getMediaById({ id: body.media_id });
    if (!media) {
        set.status = 400;
        return { error: "Media not found", processing: false };
    }
    const mediaKind = detectMediaKind(media);
    if (!mediaKind) {
        set.status = 400;
        return { error: "Unsupported media type (use image or video)", processing: false };
    }

    const automationUser = await getAutomationUserById({ id: body.automation_user_id });
    if (!automationUser) {
        set.status = 400;
        return { error: "Automation user not found", processing: false };
    }

    const platforms = parsePlatforms(body.platforms).filter((platform) =>
        SUPPORTED_PLATFORMS.has(platform),
    );
    if (!platforms.length) {
        set.status = 400;
        return {
            error: "Select at least one platform (instagram, youtube, linkedin)",
            processing: false,
        };
    }

    for (const platform of platforms) {
        const cookieField = PLATFORM_COOKIE[platform];
        if (!cookieField) {
            set.status = 400;
            return { error: `Unsupported platform: ${platform}`, processing: false };
        }
        if (!String(automationUser[cookieField] || "").trim()) {
            set.status = 400;
            return {
                error:
                    platform === "instagram"
                        ? "User is missing an Instagram access token"
                        : `User is missing a ${platform} cookie`,
                processing: false,
            };
        }
    }

    const instagram_caption = platforms.includes("instagram")
        ? trimOrNull(body.instagram_caption)
        : null;
    const youtube_title = platforms.includes("youtube") ? trimOrNull(body.youtube_title) : null;
    const youtube_description = platforms.includes("youtube")
        ? trimOrNull(body.youtube_description)
        : null;
    const youtube_channel_id = platforms.includes("youtube")
        ? normalizeYoutubeChannelId(body.youtube_channel_id)
        : null;
    const linkedin_caption = platforms.includes("linkedin")
        ? trimOrNull(body.linkedin_caption)
        : null;
    const linkedin_company_id = platforms.includes("linkedin")
        ? normalizeLinkedinCompanyId(body.linkedin_company_id)
        : null;
    const instagram_user_id = platforms.includes("instagram")
        ? normalizeInstagramUserId(
            body.instagram_user_id || automationUser.instagram_user_id,
        )
        : null;
    const instagram_destinations = platforms.includes("instagram")
        ? normalizeInstagramDestinations(body)
        : [];
    const youtube_destination = platforms.includes("youtube")
        ? String(body.youtube_destination || (mediaKind === "video" ? "shorts" : "community"))
            .trim()
            .toLowerCase()
        : "community";

    const validationError = validatePublishFields({
        platforms,
        mediaKind,
        instagram_caption,
        instagram_user_id,
        instagram_destinations,
        youtube_title,
        youtube_channel_id,
        youtube_destination,
        linkedin_caption,
        linkedin_company_id,
    });
    if (validationError) {
        set.status = 400;
        return { error: validationError, processing: false };
    }

    const scheduledByName =
        String(currentUser.full_name || currentUser.email || "user").trim() || "user";

    const runOptions = {
        instagram_destinations,
        youtube_destination,
        instagram_user_id,
        youtube_channel_id,
        linkedin_company_id,
    };

    const runId = await createContentPublishRun({
        media_id: media.id,
        media_kind: mediaKind,
        automation_user_id: automationUser.id,
        user_name: automationUser.name,
        instagram_caption,
        youtube_title,
        youtube_description,
        linkedin_caption,
        source: "user",
        created_by: currentUser.id,
        scheduled_by_name: scheduledByName,
        run_options: runOptions,
        status: "queued",
    });
    if (!runId) {
        set.status = 400;
        return { error: "Failed to create content publish run", processing: false };
    }

    const targets = [];
    for (const platform of platforms) {
        const targetId = await createContentPublishRunTarget({ run_id: runId, platform });
        if (!targetId) {
            set.status = 400;
            return { error: "Failed to create content publish target", processing: false };
        }
        targets.push({
            targetId,
            platform,
            cookie: String(automationUser[PLATFORM_COOKIE[platform]] || "").trim(),
            youtubeChannelId: platform === "youtube" ? youtube_channel_id : null,
            linkedinCompanyId: platform === "linkedin" ? linkedin_company_id : null,
            instagramUserId: platform === "instagram" ? instagram_user_id : null,
        });
    }

    const mediaPath = join(Bun.env.DIRECTORY_MEDIA, media.file);
    logger.info(
        `content-publish enqueue run=${runId} source=user user=${automationUser.name} kind=${mediaKind} platforms=${platforms.join(",")} ig_dest=${instagram_destinations.join("+") || "-"} yt_dest=${youtube_destination} media_id=${media.id}`,
    );
    enqueueContentPublishRun(runId, {
        runId,
        mediaPath,
        mediaId: media.id,
        targets,
        instagramCaption: instagram_caption,
        youtubeTitle: youtube_title,
        youtubeDescription: youtube_description,
        linkedinCaption: linkedin_caption,
        mediaKind,
        instagramDestinations: instagram_destinations,
        youtubeDestination: youtube_destination,
    });

    set.status = 202;
    return {
        message: "Content publish queued",
        processing,
        run_id: runId,
        instagram_destinations: platforms.includes("instagram") ? instagram_destinations : null,
        youtube_destination: platforms.includes("youtube") ? youtube_destination : null,
        run: decorateContentPublishRun(await getContentPublishRunById({ id: runId })),
    };
}

/**
 * Re-queue only failed platforms from an existing run as a new queued run.
 * Successful platforms are omitted. Website runs only (stored automation user).
 */
export async function retryContentPublishRun({ params, body, set, cookie }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized", processing: false };
    }

    const original = await getContentPublishRunById({ id: params.id });
    if (!original) {
        set.status = 404;
        return { error: "Content publish run not found", processing: false };
    }

    if (!original.automation_user_id || String(original.source || "") === "application") {
        set.status = 400;
        return {
            error: "Retry is only available for website runs with a saved automation user",
            processing: false,
        };
    }

    const originalStatus = String(original.status || "").toLowerCase();
    if (originalStatus === "queued" || originalStatus === "running") {
        set.status = 400;
        return {
            error: "Wait for the run to finish before retrying failed platforms",
            processing: false,
        };
    }

    const originalTargets = await getContentPublishRunTargetsByRunId({ run_id: original.id });
    const failedPlatforms = [
        ...new Set(
            originalTargets
                .filter((target) => String(target.status || "").toLowerCase() === "failed")
                .map((target) => String(target.platform || "").trim())
                .filter((platform) => SUPPORTED_PLATFORMS.has(platform)),
        ),
    ];
    if (!failedPlatforms.length) {
        set.status = 400;
        return { error: "No failed platforms to retry", processing: false };
    }

    const requested = parsePlatforms(body?.platforms).filter((platform) =>
        SUPPORTED_PLATFORMS.has(platform),
    );
    const platforms = requested.length
        ? requested.filter((platform) => failedPlatforms.includes(platform))
        : failedPlatforms;
    if (!platforms.length) {
        set.status = 400;
        return {
            error: `Requested platforms were not failed on run #${original.id} (failed: ${failedPlatforms.join(", ")})`,
            processing: false,
        };
    }

    const media = await getMediaById({ id: original.media_id });
    if (!media) {
        set.status = 400;
        return { error: "Original media not found", processing: false };
    }
    const mediaKind = detectMediaKind(media) || String(original.media_kind || "").trim() || null;
    if (!mediaKind) {
        set.status = 400;
        return { error: "Unsupported media type (use image or video)", processing: false };
    }

    const automationUser = await getAutomationUserById({ id: original.automation_user_id });
    if (!automationUser) {
        set.status = 400;
        return { error: "Automation user not found", processing: false };
    }

    for (const platform of platforms) {
        const cookieField = PLATFORM_COOKIE[platform];
        if (!String(automationUser[cookieField] || "").trim()) {
            set.status = 400;
            return {
                error:
                    platform === "instagram"
                        ? "User is missing an Instagram access token"
                        : `User is missing a ${platform} cookie`,
                processing: false,
            };
        }
    }

    const options = parseContentPublishRunOptions(original);
    const instagram_caption = platforms.includes("instagram")
        ? trimOrNull(original.instagram_caption)
        : null;
    const youtube_title = platforms.includes("youtube")
        ? trimOrNull(original.youtube_title)
        : null;
    const youtube_description = platforms.includes("youtube")
        ? trimOrNull(original.youtube_description)
        : null;
    const linkedin_caption = platforms.includes("linkedin")
        ? trimOrNull(original.linkedin_caption)
        : null;
    const youtube_channel_id = platforms.includes("youtube")
        ? normalizeYoutubeChannelId(
            options.youtube_channel_id || automationUser.youtube_channel_id,
        )
        : null;
    const linkedin_company_id = platforms.includes("linkedin")
        ? normalizeLinkedinCompanyId(
            options.linkedin_company_id || automationUser.linkedin_company_id,
        )
        : null;
    const instagram_user_id = platforms.includes("instagram")
        ? normalizeInstagramUserId(
            options.instagram_user_id || automationUser.instagram_user_id,
        )
        : null;
    const instagram_destinations = platforms.includes("instagram")
        ? options.instagram_destinations?.length
            ? options.instagram_destinations
            : ["feed"]
        : [];
    const youtube_destination = platforms.includes("youtube")
        ? String(
            options.youtube_destination
                || (mediaKind === "video" ? "shorts" : "community"),
        )
            .trim()
            .toLowerCase()
        : "community";

    const validationError = validatePublishFields({
        platforms,
        mediaKind,
        instagram_caption,
        instagram_user_id,
        instagram_destinations,
        youtube_title,
        youtube_channel_id,
        youtube_destination,
        linkedin_caption,
        linkedin_company_id,
    });
    if (validationError) {
        set.status = 400;
        return { error: validationError, processing: false };
    }

    const scheduledByName =
        String(currentUser.full_name || currentUser.email || "user").trim() || "user";

    const runOptions = {
        instagram_destinations,
        youtube_destination,
        instagram_user_id,
        youtube_channel_id,
        linkedin_company_id,
        retried_from_run_id: original.id,
    };

    const runId = await createContentPublishRun({
        media_id: media.id,
        media_kind: mediaKind,
        automation_user_id: automationUser.id,
        user_name: automationUser.name,
        instagram_caption,
        youtube_title,
        youtube_description,
        linkedin_caption,
        source: "user",
        created_by: currentUser.id,
        scheduled_by_name: scheduledByName,
        run_options: runOptions,
        status: "queued",
    });
    if (!runId) {
        set.status = 400;
        return { error: "Failed to create retry run", processing: false };
    }

    const targets = [];
    for (const platform of platforms) {
        const targetId = await createContentPublishRunTarget({ run_id: runId, platform });
        if (!targetId) {
            set.status = 400;
            return { error: "Failed to create content publish target", processing: false };
        }
        targets.push({
            targetId,
            platform,
            cookie: String(automationUser[PLATFORM_COOKIE[platform]] || "").trim(),
            youtubeChannelId: platform === "youtube" ? youtube_channel_id : null,
            linkedinCompanyId: platform === "linkedin" ? linkedin_company_id : null,
            instagramUserId: platform === "instagram" ? instagram_user_id : null,
        });
    }

    const mediaPath = join(Bun.env.DIRECTORY_MEDIA, media.file);
    logger.info(
        `content-publish retry enqueue run=${runId} from=${original.id} user=${automationUser.name} platforms=${platforms.join(",")} media_id=${media.id}`,
    );
    enqueueContentPublishRun(runId, {
        runId,
        mediaPath,
        mediaId: media.id,
        targets,
        instagramCaption: instagram_caption,
        youtubeTitle: youtube_title,
        youtubeDescription: youtube_description,
        linkedinCaption: linkedin_caption,
        mediaKind,
        instagramDestinations: instagram_destinations,
        youtubeDestination: youtube_destination,
    });

    set.status = 202;
    return {
        message: `Retry queued for ${platforms.join(", ")}`,
        processing,
        run_id: runId,
        retried_from_run_id: original.id,
        platforms,
        run: decorateContentPublishRun(await getContentPublishRunById({ id: runId })),
    };
}

export async function startContentPublishServiceRun({ body, application, set }) {
    const uploadedFile = body.file;
    if (!uploadedFile) {
        set.status = 400;
        return { error: "File is required" };
    }

    const name = String(uploadedFile.name || "file").slice(0, 64);
    const extension = filer.getExtensionByFileName(name);
    const file = extension
        ? `${filer.generateRandomFileName()}.${extension}`
        : filer.generateRandomFileName();
    await Bun.write(join(Bun.env.DIRECTORY_MEDIA, file), uploadedFile);
    const mediaId = await createMedia({ name, file });
    if (!mediaId) {
        set.status = 400;
        return { error: "Failed to store media" };
    }
    const media = await getMediaById({ id: mediaId });
    const mediaKind = detectMediaKind(media);
    if (!mediaKind) {
        set.status = 400;
        return { error: "Unsupported media type (use image or video)" };
    }

    const platforms = parsePlatforms(body.platforms).filter((platform) =>
        SUPPORTED_PLATFORMS.has(platform),
    );
    if (!platforms.length) {
        set.status = 400;
        return { error: "Select at least one platform (instagram, youtube, linkedin)" };
    }

    const instagram_access_token = trimOrNull(body.instagram_access_token);
    const instagram_user_id = platforms.includes("instagram")
        ? normalizeInstagramUserId(body.instagram_user_id)
        : null;
    const instagram_caption = platforms.includes("instagram")
        ? trimOrNull(body.instagram_caption)
        : null;
    const instagram_destinations = platforms.includes("instagram")
        ? normalizeInstagramDestinations(body)
        : [];

    const youtube_cookie = trimOrNull(body.youtube_cookie);
    const youtube_title = platforms.includes("youtube") ? trimOrNull(body.youtube_title) : null;
    const youtube_description = platforms.includes("youtube")
        ? trimOrNull(body.youtube_description)
        : null;
    const youtube_channel_id = platforms.includes("youtube")
        ? normalizeYoutubeChannelId(body.youtube_channel_id)
        : null;
    const youtube_destination = platforms.includes("youtube")
        ? String(body.youtube_destination || (mediaKind === "video" ? "shorts" : "community"))
            .trim()
            .toLowerCase()
        : "community";

    const linkedin_cookie = trimOrNull(body.linkedin_cookie);
    const linkedin_caption = platforms.includes("linkedin")
        ? trimOrNull(body.linkedin_caption)
        : null;
    const linkedin_company_id = platforms.includes("linkedin")
        ? normalizeLinkedinCompanyId(body.linkedin_company_id)
        : null;

    if (platforms.includes("instagram") && !instagram_access_token) {
        set.status = 400;
        return { error: "instagram_access_token is required" };
    }
    if (platforms.includes("youtube") && !youtube_cookie) {
        set.status = 400;
        return { error: "youtube_cookie is required" };
    }
    if (platforms.includes("linkedin") && !linkedin_cookie) {
        set.status = 400;
        return { error: "linkedin_cookie is required" };
    }

    const validationError = validatePublishFields({
        platforms,
        mediaKind,
        instagram_caption,
        instagram_user_id,
        instagram_destinations,
        youtube_title,
        youtube_channel_id,
        youtube_destination,
        linkedin_caption,
        linkedin_company_id,
    });
    if (validationError) {
        set.status = 400;
        return { error: validationError };
    }

    const scheduledByName = String(application?.title || "application").trim() || "application";
    const runOptions = {
        instagram_destinations,
        youtube_destination,
        instagram_user_id,
        youtube_channel_id,
        linkedin_company_id,
    };

    const runId = await createContentPublishRun({
        media_id: media.id,
        media_kind: mediaKind,
        automation_user_id: null,
        user_name: scheduledByName,
        instagram_caption,
        youtube_title,
        youtube_description,
        linkedin_caption,
        source: "application",
        created_by: null,
        application_id: application.id,
        application_service_id: application.service?.id || null,
        scheduled_by_name: scheduledByName,
        run_options: runOptions,
        status: "queued",
    });
    if (!runId) {
        set.status = 400;
        return { error: "Failed to create content publish run" };
    }

    const targets = [];
    for (const platform of platforms) {
        const targetId = await createContentPublishRunTarget({ run_id: runId, platform });
        if (!targetId) {
            set.status = 400;
            return { error: "Failed to create content publish target" };
        }
        let cookie = "";
        if (platform === "instagram") {
            cookie = instagram_access_token;
        } else if (platform === "youtube") {
            cookie = youtube_cookie;
        } else if (platform === "linkedin") {
            cookie = linkedin_cookie;
        }
        targets.push({
            targetId,
            platform,
            cookie,
            youtubeChannelId: platform === "youtube" ? youtube_channel_id : null,
            linkedinCompanyId: platform === "linkedin" ? linkedin_company_id : null,
            instagramUserId: platform === "instagram" ? instagram_user_id : null,
        });
    }

    logger.info(
        `content-publish enqueue run=${runId} source=application app=${scheduledByName} kind=${mediaKind} platforms=${platforms.join(",")} ig_dest=${instagram_destinations.join("+")} yt_dest=${youtube_destination}`,
    );
    enqueueContentPublishRun(runId, {
        runId,
        mediaPath: join(Bun.env.DIRECTORY_MEDIA, media.file),
        mediaId: media.id,
        targets,
        instagramCaption: instagram_caption,
        youtubeTitle: youtube_title,
        youtubeDescription: youtube_description,
        linkedinCaption: linkedin_caption,
        mediaKind,
        instagramDestinations: instagram_destinations,
        youtubeDestination: youtube_destination,
    });

    set.status = 202;
    return {
        run_id: runId,
        media_kind: mediaKind,
        platforms,
        instagram_destinations: platforms.includes("instagram") ? instagram_destinations : null,
        youtube_destination: platforms.includes("youtube") ? youtube_destination : null,
    };
}

export async function getContentPublishServiceRun({ params, application, set }) {
    const run = await getContentPublishRunByIdForApplication({
        id: params.id,
        application_id: application.id,
    });
    if (!run) {
        set.status = 404;
        return { error: "Content publish run not found" };
    }
    const targets = await getContentPublishRunTargetsByRunId({ run_id: run.id });
    set.status = 200;
    return {
        run: {
            ...decorateContentPublishRun(run),
            targets: targets.map((target) => ({
                ...target,
                screenshot_urls: (() => {
                    const files = [];
                    if (target.screenshot_files) {
                        try {
                            const parsed =
                                typeof target.screenshot_files === "string"
                                    ? JSON.parse(target.screenshot_files)
                                    : target.screenshot_files;
                            if (Array.isArray(parsed)) {
                                files.push(
                                    ...parsed.map((item) => String(item || "").trim()).filter(Boolean),
                                );
                            }
                        } catch {
                            // ignore
                        }
                    }
                    return files.map(
                        (file) => `/api/content-publish/screenshots/${encodeURIComponent(file)}`,
                    );
                })(),
            })),
        },
    };
}

export async function getContentPublishRuns({ set }) {
    const runs = await getAllContentPublishRuns();
    const targets = await getAllContentPublishRunTargets();
    const counts = await getContentPublishRunStatusCounts();
    const targetsByRunId = new Map();
    for (const target of targets) {
        const list = targetsByRunId.get(target.run_id) || [];
        list.push(target);
        targetsByRunId.set(target.run_id, list);
    }

    set.status = 200;
    return {
        contentPublishRuns: runs.map((run) => ({
            ...decorateContentPublishRun(run),
            targets: targetsByRunId.get(run.id) || [],
        })),
        processing,
        queue: counts,
    };
}

export async function getContentPublishRun({ params, set }) {
    const run = await getContentPublishRunById({ id: params.id });
    if (!run) {
        set.status = 404;
        return { error: "Content publish run not found" };
    }

    set.status = 200;
    return {
        contentPublishRun: {
            ...decorateContentPublishRun(run),
            targets: await getContentPublishRunTargetsByRunId({ run_id: run.id }),
        },
        processing,
    };
}

export async function getContentPublishScreenshot({ params, set }) {
    const path = resolveContentPublishScreenshotPath(params.file);
    if (!path) {
        set.status = 400;
        return { error: "Invalid screenshot file" };
    }

    const diskFile = Bun.file(path);
    if (!(await diskFile.exists())) {
        set.status = 404;
        return { error: "Screenshot not found" };
    }

    set.headers["Content-Type"] = "image/png";
    set.headers["Content-Disposition"] = `inline; filename="${params.file}"`;
    set.status = 200;
    return diskFile;
}

/** Unauthenticated — Meta fetches image_url for Instagram Graph publishing. */
export async function getContentPublishPublicMedia({ params, set }) {
    const resolved = await resolveContentPublishPublicMediaFile(params.token);
    if (!resolved) {
        set.status = 404;
        return { error: "Media not found or token expired" };
    }

    const { media, diskFile } = resolved;
    set.headers["Content-Disposition"] = `inline; filename="${String(media.name || media.file).replace(/"/g, "")}"`;
    set.headers["Content-Type"] =
        filer.getContentTypeByFileName(media.file) || "application/octet-stream";
    set.headers["Cache-Control"] = "private, max-age=300";
    set.status = 200;
    return diskFile;
}
