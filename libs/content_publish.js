import { logger } from "@hammerbyte/utils";
import { toDbDateTime } from "./date.js";
import {
    acquireContentPublishProcessing,
    loginFacebookWithCookie,
    loginInstagramWithCookie,
    loginLinkedinWithCookie,
    loginYoutubeWithCookie,
    openFirefox,
    releaseContentPublishProcessing,
} from "./content_publish_browser.js";
import {
    updateContentPublishRunById,
    updateContentPublishRunTargetById,
} from "../db/content_publish_runs.js";
import { notifyContentPublishRunComplete } from "./content_publish_notify.js";
import { publishFacebookImagePost } from "./content_publish/facebook_post_pom.js";
import { publishInstagramImagePost } from "./content_publish/instagram_post_pom.js";
import { publishYoutubeCommunityImagePost } from "./content_publish/youtube_community_pom.js";
import { publishLinkedinImagePost } from "./content_publish/linkedin_post_pom.js";

const PLATFORM_ORDER = ["facebook", "instagram", "youtube", "linkedin"];

export function startContentPublish({
    runId,
    mediaPath,
    targets = [],
    facebookCaption = null,
    instagramCaption = null,
    instagramHashtags = null,
    youtubeTitle = null,
    youtubeDescription = null,
    linkedinCaption = null,
} = {}) {
    if (!acquireContentPublishProcessing()) {
        return false;
    }

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
        }))
        .filter((target) => target.targetId && target.platform && target.cookie);

    if (!runId || !mediaPath || !targetList.length) {
        releaseContentPublishProcessing();
        return false;
    }

    targetList.sort(
        (left, right) =>
            PLATFORM_ORDER.indexOf(left.platform) - PLATFORM_ORDER.indexOf(right.platform),
    );

    (async () => {
        let runFailedMessage = null;
        let completedCount = 0;

        try {
            for (const target of targetList) {
                let driver = null;
                try {
                    await updateContentPublishRunTargetById({
                        id: target.targetId,
                        status: "running",
                    });

                    driver = await openFirefox();
                    if (target.platform === "facebook") {
                        await loginFacebookWithCookie(driver, target.cookie);
                        await publishFacebookImagePost({
                            driver,
                            mediaPath,
                            caption: facebookCaption,
                        });
                    } else if (target.platform === "instagram") {
                        await loginInstagramWithCookie(driver, target.cookie);
                        await publishInstagramImagePost({
                            driver,
                            mediaPath,
                            caption: instagramCaption,
                            hashtags: instagramHashtags,
                        });
                    } else if (target.platform === "youtube") {
                        await loginYoutubeWithCookie(driver, target.cookie);
                        await publishYoutubeCommunityImagePost({
                            driver,
                            mediaPath,
                            title: youtubeTitle,
                            description: youtubeDescription,
                            channelId: target.youtubeChannelId,
                        });
                    } else if (target.platform === "linkedin") {
                        await loginLinkedinWithCookie(driver, target.cookie);
                        await publishLinkedinImagePost({
                            driver,
                            mediaPath,
                            caption: linkedinCaption,
                            companyId: target.linkedinCompanyId,
                        });
                    } else {
                        throw new Error(`Unsupported platform: ${target.platform}`);
                    }

                    await updateContentPublishRunTargetById({
                        id: target.targetId,
                        status: "completed",
                    });
                    completedCount += 1;
                    logger.info(`content publish ${target.platform} completed`);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    const screenshotFile =
                        error && typeof error === "object" && error.screenshotFile
                            ? String(error.screenshotFile)
                            : null;
                    logger.error(
                        `content publish ${target.platform} failed: ${message}${
                            screenshotFile ? ` screenshot=${screenshotFile}` : ""
                        }`,
                    );
                    runFailedMessage = message;
                    await updateContentPublishRunTargetById({
                        id: target.targetId,
                        status: "failed",
                        error_message: message,
                        screenshot_file: screenshotFile,
                    });
                } finally {
                    if (driver) {
                        try {
                            await driver.quit();
                        } catch (quitError) {
                            logger.error(`content publish driver quit: ${quitError}`);
                        }
                    }
                }
            }

            await updateContentPublishRunById({
                id: runId,
                status: completedCount > 0 ? "completed" : "failed",
                error_message: runFailedMessage,
                finished_on: toDbDateTime(new Date()),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`content publish run failed: ${message}`);
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
                logger.error(`content publish notify: ${notifyError}`);
            }
            releaseContentPublishProcessing();
        }
    })();

    return true;
}
