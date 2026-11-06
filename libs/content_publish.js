import { logger } from "@hammerbyte/utils";
import { toDbDateTime } from "./date.js";
import {
    loginLinkedinWithCookie,
    loginYoutubeWithCookie,
    openFirefox,
} from "./content_publish_browser.js";
import {
    updateContentPublishRunById,
    updateContentPublishRunTargetById,
} from "../db/content_publish_runs.js";
import { notifyContentPublishRunComplete } from "./content_publish_notify.js";
import { createInstagramPublisher } from "./instagram/index.js";
import {
    publishImagePost as publishLinkedinImagePost,
    publishVideoPost as publishLinkedinVideoPost,
} from "./linkedin/index.js";
import {
    publishCommunityImage as publishYoutubeCommunityImage,
    publishShort as publishYoutubeShort,
} from "./youtube/index.js";
import { buildContentPublishPublicMediaUrl } from "./content_publish_public_media.js";
import {
    captureContentPublishScreenshot,
    normalizeScreenshotFiles,
    serializeScreenshotFiles,
} from "./content_publish_screenshot.js";

const PLATFORM_ORDER = ["instagram", "youtube", "linkedin"];

/**
 * Execute one content-publish run to completion (awaitable).
 * Caller owns the processing lock / queue drain.
 */
export async function executeContentPublishRun({
    runId,
    mediaPath,
    mediaId = null,
    targets = [],
    instagramCaption = null,
    youtubeTitle = null,
    youtubeDescription = null,
    linkedinCaption = null,
    mediaKind = "image",
    instagramDestinations = null,
    instagramDestination = "feed",
    youtubeDestination = "community",
} = {}) {
    const kind = String(mediaKind || "image").trim().toLowerCase() === "video"
        ? "video"
        : "image";
    const allowedIg = new Set(["feed", "story"]);
    let igDestinations = [];
    if (Array.isArray(instagramDestinations) && instagramDestinations.length) {
        igDestinations = [
            ...new Set(
                instagramDestinations
                    .map((item) => String(item || "").trim().toLowerCase())
                    .filter((item) => allowedIg.has(item)),
            ),
        ];
    }
    if (!igDestinations.length) {
        const fallback = String(instagramDestination || "feed").trim().toLowerCase();
        igDestinations = allowedIg.has(fallback) ? [fallback] : ["feed"];
    }
    const ytDestination = String(youtubeDestination || (kind === "video" ? "shorts" : "community"))
        .trim()
        .toLowerCase();

    const targetList = (targets || [])
        .map((target) => ({
            targetId: target?.targetId,
            platform: String(target?.platform || "").trim(),
            cookie: String(target?.cookie || "").trim(),
            youtubeChannelId: target?.youtubeChannelId
                ? String(target.youtubeChannelId).trim()
                : null,
            linkedinCompanyId: target?.linkedinCompanyId
                ? String(target.linkedinCompanyId).trim()
                : null,
            instagramUserId: target?.instagramUserId
                ? String(target.instagramUserId).trim()
                : null,
        }))
        .filter((target) => target.targetId && target.platform && target.cookie);

    if (!runId || !mediaPath || !targetList.length) {
        throw new Error("Invalid content publish run payload");
    }

    targetList.sort(
        (left, right) =>
            PLATFORM_ORDER.indexOf(left.platform) - PLATFORM_ORDER.indexOf(right.platform),
    );

    logger.info(
        `content-publish run=${runId} executing kind=${kind} platforms=${targetList
            .map((target) => target.platform)
            .join(",")} media=${mediaPath}`,
    );

    let runFailedMessage = null;
    let completedCount = 0;

    try {
        for (const target of targetList) {
            let driver = null;
            try {
                logger.info(
                    `content-publish run=${runId} platform=${target.platform} starting`,
                );
                await updateContentPublishRunTargetById({
                    id: target.targetId,
                    status: "running",
                });

                if (target.platform === "instagram") {
                    if (!mediaId) {
                        throw new Error("Instagram API publish requires media_id");
                    }
                    if (!target.instagramUserId) {
                        throw new Error("Instagram user id is required for API publish");
                    }
                    const mediaUrl = buildContentPublishPublicMediaUrl(
                        mediaId,
                        kind === "video" ? 7200 : 3600,
                    );
                    const instagram = createInstagramPublisher({
                        accessToken: target.cookie,
                        igUserId: target.instagramUserId,
                    });

                    for (const igDestination of igDestinations) {
                        if (kind === "video") {
                            if (igDestination === "story") {
                                logger.info(
                                    `content-publish run=${runId} platform=instagram publishing video story via Graph API ig_user=${target.instagramUserId} video_url=${mediaUrl}`,
                                );
                                await instagram.publishStory({ videoUrl: mediaUrl });
                            } else {
                                logger.info(
                                    `content-publish run=${runId} platform=instagram publishing reel via Graph API ig_user=${target.instagramUserId} video_url=${mediaUrl}`,
                                );
                                await instagram.publishReel({
                                    videoUrl: mediaUrl,
                                    caption: instagramCaption,
                                });
                            }
                        } else if (igDestination === "story") {
                            logger.info(
                                `content-publish run=${runId} platform=instagram publishing image story via Graph API ig_user=${target.instagramUserId} image_url=${mediaUrl}`,
                            );
                            await instagram.publishStory({ imageUrl: mediaUrl });
                        } else {
                            logger.info(
                                `content-publish run=${runId} platform=instagram publishing feed image via Graph API ig_user=${target.instagramUserId} image_url=${mediaUrl}`,
                            );
                            await instagram.publishFeedImage({
                                imageUrl: mediaUrl,
                                caption: instagramCaption,
                            });
                        }
                    }
                } else {
                    logger.info(
                        `content-publish run=${runId} platform=${target.platform} opening firefox`,
                    );
                    driver = await openFirefox();
                    if (target.platform === "youtube") {
                        logger.info(
                            `content-publish run=${runId} platform=youtube logging in channel=${target.youtubeChannelId || "?"}`,
                        );
                        await loginYoutubeWithCookie(driver, target.cookie);
                        if (kind === "video" || ytDestination === "shorts") {
                            logger.info(
                                `content-publish run=${runId} platform=youtube publishing shorts`,
                            );
                            await publishYoutubeShort({
                                driver,
                                mediaPath,
                                title: youtubeTitle,
                                description: youtubeDescription,
                                channelId: target.youtubeChannelId,
                            });
                        } else {
                            logger.info(
                                `content-publish run=${runId} platform=youtube publishing community`,
                            );
                            await publishYoutubeCommunityImage({
                                driver,
                                mediaPath,
                                title: youtubeTitle,
                                description: youtubeDescription,
                                channelId: target.youtubeChannelId,
                            });
                        }
                    } else if (target.platform === "linkedin") {
                        logger.info(
                            `content-publish run=${runId} platform=linkedin logging in company=${target.linkedinCompanyId || "?"}`,
                        );
                        await loginLinkedinWithCookie(driver, target.cookie);
                        if (kind === "video") {
                            logger.info(
                                `content-publish run=${runId} platform=linkedin publishing video`,
                            );
                            await publishLinkedinVideoPost({
                                driver,
                                mediaPath,
                                caption: linkedinCaption,
                                companyId: target.linkedinCompanyId,
                            });
                        } else {
                            logger.info(
                                `content-publish run=${runId} platform=linkedin publishing`,
                            );
                            await publishLinkedinImagePost({
                                driver,
                                mediaPath,
                                caption: linkedinCaption,
                                companyId: target.linkedinCompanyId,
                            });
                        }
                    } else {
                        throw new Error(`Unsupported platform: ${target.platform}`);
                    }
                }

                await updateContentPublishRunTargetById({
                    id: target.targetId,
                    status: "completed",
                });
                completedCount += 1;
                logger.info(
                    `content-publish run=${runId} platform=${target.platform} completed`,
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                let screenshotFiles = normalizeScreenshotFiles(
                    error && typeof error === "object"
                        ? error.screenshotFiles || error.screenshotFile
                        : null,
                );
                if (driver && !screenshotFiles.length) {
                    try {
                        const fallback = await captureContentPublishScreenshot(
                            driver,
                            `${target.platform}-fail`,
                        );
                        if (fallback) {
                            screenshotFiles = [fallback];
                        }
                    } catch {
                        // keep original error
                    }
                }
                logger.error(
                    `content-publish run=${runId} platform=${target.platform} failed: ${message}${
                        screenshotFiles.length
                            ? ` screenshots=${screenshotFiles.length} last=${screenshotFiles[screenshotFiles.length - 1]}`
                            : ""
                    }`,
                );
                runFailedMessage = message;
                await updateContentPublishRunTargetById({
                    id: target.targetId,
                    status: "failed",
                    error_message: message,
                    screenshot_files: serializeScreenshotFiles(screenshotFiles),
                });
            } finally {
                if (driver) {
                    try {
                        await driver.quit();
                        logger.info(
                            `content-publish run=${runId} platform=${target.platform} browser closed`,
                        );
                    } catch (quitError) {
                        logger.error(
                            `content-publish run=${runId} platform=${target.platform} driver quit: ${quitError}`,
                        );
                    }
                }
            }
        }

        const status = completedCount > 0 ? "completed" : "failed";
        await updateContentPublishRunById({
            id: runId,
            status,
            error_message: runFailedMessage,
            finished_on: toDbDateTime(new Date()),
        });
        logger.info(
            `content-publish run=${runId} finished status=${status} completed=${completedCount}/${targetList.length}`,
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`content-publish run=${runId} failed: ${message}`);
        await updateContentPublishRunById({
            id: runId,
            status: "failed",
            error_message: message,
            finished_on: toDbDateTime(new Date()),
        });
    } finally {
        try {
            await notifyContentPublishRunComplete({ runId });
        } catch (notifyError) {
            logger.error(`content-publish run=${runId} notify: ${notifyError}`);
        }
    }
}
