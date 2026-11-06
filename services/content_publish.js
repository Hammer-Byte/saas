import { join } from "node:path";
import { filer, logger } from "@hammerbyte/utils";
import { getAutomationUserById } from "../db/automation_users.js";
import { getMediaById } from "../db/media.js";
import {
    createContentPublishRun,
    createContentPublishRunTarget,
    getAllContentPublishRunTargets,
    getAllContentPublishRuns,
    getContentPublishRunById,
    getContentPublishRunTargetsByRunId,
} from "../db/content_publish_runs.js";
import { processing } from "../libs/content_publish_browser.js";
import { startContentPublish } from "../libs/content_publish.js";
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

function isImageMedia(media) {
    const name = String(media?.file || media?.name || "");
    const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    return IMAGE_EXTENSIONS.has(extension);
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

export async function getContentPublishStatus({ set }) {
    set.status = 200;
    return { processing };
}

export async function startContentPublishRun({ body, set, cookie }) {
    if (processing) {
        set.status = 409;
        return { error: "Content publish already in progress", processing: true };
    }

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
    if (!isImageMedia(media)) {
        set.status = 400;
        return { error: "Only image media is supported", processing: false };
    }

    const automationUser = await getAutomationUserById({ id: body.automation_user_id });
    if (!automationUser) {
        set.status = 400;
        return { error: "Automation user not found", processing: false };
    }

    const platforms = [...new Set((body.platforms || []).map((platform) => String(platform)))];
    if (!platforms.length) {
        set.status = 400;
        return { error: "Select at least one platform", processing: false };
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

    const facebook_caption = platforms.includes("facebook")
        ? trimOrNull(body.facebook_caption)
        : null;
    const instagram_caption = platforms.includes("instagram")
        ? trimOrNull(body.instagram_caption)
        : null;
    const instagram_hashtags = platforms.includes("instagram")
        ? trimOrNull(body.instagram_hashtags)
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

    if (platforms.includes("facebook") && !facebook_caption) {
        set.status = 400;
        return { error: "Facebook caption is required", processing: false };
    }
    if (platforms.includes("instagram") && !instagram_caption) {
        set.status = 400;
        return { error: "Instagram caption is required", processing: false };
    }
    if (platforms.includes("instagram") && !instagram_user_id) {
        set.status = 400;
        return {
            error: "Instagram user id is required (Graph IG professional account id)",
            processing: false,
        };
    }
    if (platforms.includes("youtube") && !youtube_title) {
        set.status = 400;
        return { error: "YouTube title is required", processing: false };
    }
    if (platforms.includes("youtube") && !youtube_channel_id) {
        set.status = 400;
        return {
            error: "YouTube channel id (UC… or channel URL) is required",
            processing: false,
        };
    }
    if (platforms.includes("linkedin") && !linkedin_caption) {
        set.status = 400;
        return { error: "LinkedIn caption is required", processing: false };
    }
    if (platforms.includes("linkedin") && !linkedin_company_id) {
        set.status = 400;
        return {
            error: "LinkedIn page / company id is required",
            processing: false,
        };
    }

    const runId = await createContentPublishRun({
        media_id: media.id,
        automation_user_id: automationUser.id,
        user_name: automationUser.name,
        facebook_caption,
        instagram_caption,
        instagram_hashtags,
        youtube_title,
        youtube_description,
        linkedin_caption,
        created_by: currentUser.id,
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
        `content-publish start requested run=${runId} user=${automationUser.name} platforms=${platforms.join(",")} media_id=${media.id}${
            instagram_user_id ? ` instagram_user=${instagram_user_id}` : ""
        }${youtube_channel_id ? ` youtube_channel=${youtube_channel_id}` : ""}${
            linkedin_company_id ? ` linkedin_company=${linkedin_company_id}` : ""
        }`,
    );
    const started = startContentPublish({
        runId,
        mediaPath,
        mediaId: media.id,
        targets,
        facebookCaption: facebook_caption,
        instagramCaption: instagram_caption,
        instagramHashtags: instagram_hashtags,
        youtubeTitle: youtube_title,
        youtubeDescription: youtube_description,
        linkedinCaption: linkedin_caption,
    });

    if (!started) {
        logger.info(`content-publish start rejected run=${runId} already processing`);
        set.status = 409;
        return { error: "Content publish already in progress", processing: true };
    }

    logger.info(`content-publish start accepted run=${runId}`);
    set.status = 202;
    return {
        message: "Content publish started",
        processing: true,
        run: await getContentPublishRunById({ id: runId }),
    };
}

export async function getContentPublishRuns({ set }) {
    const runs = await getAllContentPublishRuns();
    const targets = await getAllContentPublishRunTargets();
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
