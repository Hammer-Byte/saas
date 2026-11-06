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
    facebook: "facebook_cookie",
    instagram: "instagram_cookie",
    youtube: "youtube_cookie",
    linkedin: "linkedin_cookie",
};

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

const EXTERNAL_PLATFORMS = new Set(["instagram", "youtube", "linkedin"]);

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

function validatePublishFields({
    platforms,
    mediaKind,
    facebook_caption,
    instagram_caption,
    instagram_user_id,
    instagram_destination,
    youtube_title,
    youtube_channel_id,
    youtube_destination,
    linkedin_caption,
    linkedin_company_id,
    allowFacebook,
}) {
    if (!platforms.length) {
        return "Select at least one platform";
    }
    for (const platform of platforms) {
        if (allowFacebook && platform === "facebook") {
            continue;
        }
        if (!EXTERNAL_PLATFORMS.has(platform) && !(allowFacebook && platform === "facebook")) {
            return `Unsupported platform: ${platform}`;
        }
    }
    if (mediaKind === "video") {
        for (const platform of platforms) {
            if (!EXTERNAL_PLATFORMS.has(platform)) {
                return `Video publish does not support platform: ${platform}`;
            }
        }
    }
    if (platforms.includes("facebook") && !facebook_caption) {
        return "Facebook caption is required";
    }
    if (platforms.includes("instagram") && !instagram_caption) {
        return "Instagram caption is required";
    }
    if (platforms.includes("instagram") && !instagram_user_id) {
        return "Instagram user id is required (Graph IG professional account id)";
    }
    if (
        platforms.includes("instagram")
        && mediaKind === "video"
        && !["feed", "story"].includes(instagram_destination)
    ) {
        return "Instagram video destination must be feed or story";
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

    const platforms = parsePlatforms(body.platforms);

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

    const facebook_caption =
        mediaKind === "image" && platforms.includes("facebook")
            ? trimOrNull(body.facebook_caption)
            : null;
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
    const instagram_destination = platforms.includes("instagram")
        ? String(body.instagram_destination || "feed").trim().toLowerCase()
        : "feed";
    const youtube_destination = platforms.includes("youtube")
        ? String(body.youtube_destination || (mediaKind === "video" ? "shorts" : "community"))
            .trim()
            .toLowerCase()
        : "community";

    const validationError = validatePublishFields({
        platforms,
        mediaKind,
        facebook_caption,
        instagram_caption,
        instagram_user_id,
        instagram_destination,
        youtube_title,
        youtube_channel_id,
        youtube_destination,
        linkedin_caption,
        linkedin_company_id,
        allowFacebook: true,
    });
    if (validationError) {
        set.status = 400;
        return { error: validationError, processing: false };
    }

    const scheduledByName =
        String(currentUser.full_name || currentUser.email || "user").trim() || "user";

    const runOptions = {
        instagram_destination,
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
        facebook_caption,
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
        `content-publish enqueue run=${runId} source=user user=${automationUser.name} kind=${mediaKind} platforms=${platforms.join(",")} media_id=${media.id}`,
    );
    enqueueContentPublishRun(runId, {
        runId,
        mediaPath,
        mediaId: media.id,
        targets,
        facebookCaption: facebook_caption,
        instagramCaption: instagram_caption,
        youtubeTitle: youtube_title,
        youtubeDescription: youtube_description,
        linkedinCaption: linkedin_caption,
        mediaKind,
        instagramDestination: instagram_destination,
        youtubeDestination: youtube_destination,
    });

    set.status = 202;
    return {
        message: "Content publish queued",
        processing,
        run_id: runId,
        run: await getContentPublishRunById({ id: runId }),
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
        EXTERNAL_PLATFORMS.has(platform),
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
    const instagram_destination = platforms.includes("instagram")
        ? String(body.instagram_destination || (mediaKind === "video" ? "feed" : "feed"))
            .trim()
            .toLowerCase()
        : "feed";

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
        facebook_caption: null,
        instagram_caption,
        instagram_user_id,
        instagram_destination,
        youtube_title,
        youtube_channel_id,
        youtube_destination,
        linkedin_caption,
        linkedin_company_id,
        allowFacebook: false,
    });
    if (validationError) {
        set.status = 400;
        return { error: validationError };
    }

    const scheduledByName = String(application?.title || "application").trim() || "application";
    const runOptions = {
        instagram_destination,
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
        facebook_caption: null,
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
        `content-publish enqueue run=${runId} source=application app=${scheduledByName} kind=${mediaKind} platforms=${platforms.join(",")}`,
    );
    enqueueContentPublishRun(runId, {
        runId,
        mediaPath: join(Bun.env.DIRECTORY_MEDIA, media.file),
        mediaId: media.id,
        targets,
        facebookCaption: null,
        instagramCaption: instagram_caption,
        youtubeTitle: youtube_title,
        youtubeDescription: youtube_description,
        linkedinCaption: linkedin_caption,
        mediaKind,
        instagramDestination: instagram_destination,
        youtubeDestination: youtube_destination,
    });

    set.status = 202;
    return { run_id: runId };
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
            ...run,
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
            ...run,
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
            ...run,
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
