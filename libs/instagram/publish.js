import { logger } from "@hammerbyte/utils";
import { buildInstagramCaption } from "./caption.js";
import {
    assertPublicHttpsUrl,
    createInstagramClient,
    createInstagramMediaContainer,
    normalizeInstagramCredentials,
    publishInstagramContainer,
} from "./client.js";

function withCredentials(credentialsOrClient) {
    if (credentialsOrClient?.credentials) {
        return credentialsOrClient.credentials;
    }
    return normalizeInstagramCredentials(credentialsOrClient);
}

/**
 * Single feed image post.
 * @param {{ accessToken: string, igUserId: string } | ReturnType<typeof createInstagramClient>} credentials
 * @param {{ imageUrl: string, caption?: string|null, hashtags?: string|null }} options
 */
export async function publishFeedImage(credentials, options = {}) {
    const { accessToken, igUserId } = withCredentials(credentials);
    const imageUrl = assertPublicHttpsUrl(options.imageUrl, "image_url");
    const caption = buildInstagramCaption(options.caption, options.hashtags);

    logger.info(
        `instagram publishFeedImage ig_user=${igUserId} image_url=${imageUrl} caption_len=${caption.length}`,
    );

    const { creationId } = await createInstagramMediaContainer({
        accessToken,
        igUserId,
        params: {
            image_url: imageUrl,
            caption: caption || undefined,
        },
    });

    return publishInstagramContainer({ accessToken, igUserId, creationId });
}

/**
 * Feed carousel (2–10 images).
 * @param {{ accessToken: string, igUserId: string } | ReturnType<typeof createInstagramClient>} credentials
 * @param {{ items: Array<{ imageUrl: string }>, caption?: string|null, hashtags?: string|null }} options
 */
export async function publishFeedCarousel(credentials, options = {}) {
    const { accessToken, igUserId } = withCredentials(credentials);
    const items = Array.isArray(options.items) ? options.items : [];
    if (items.length < 2 || items.length > 10) {
        throw new Error("Instagram carousel requires 2–10 image items");
    }

    const caption = buildInstagramCaption(options.caption, options.hashtags);
    logger.info(
        `instagram publishFeedCarousel ig_user=${igUserId} items=${items.length} caption_len=${caption.length}`,
    );

    const childIds = [];
    for (const [index, item] of items.entries()) {
        const imageUrl = assertPublicHttpsUrl(item?.imageUrl, `items[${index}].image_url`);
        const { creationId } = await createInstagramMediaContainer({
            accessToken,
            igUserId,
            params: {
                is_carousel_item: true,
                image_url: imageUrl,
            },
        });
        childIds.push(creationId);
    }

    const { creationId } = await createInstagramMediaContainer({
        accessToken,
        igUserId,
        params: {
            media_type: "CAROUSEL",
            children: childIds.join(","),
            caption: caption || undefined,
        },
    });

    return publishInstagramContainer({
        accessToken,
        igUserId,
        creationId,
        timeoutMs: 300_000,
    });
}

/**
 * Reel (feed video).
 * @param {{ accessToken: string, igUserId: string } | ReturnType<typeof createInstagramClient>} credentials
 * @param {{ videoUrl: string, caption?: string|null, hashtags?: string|null, coverUrl?: string|null }} options
 */
export async function publishReel(credentials, options = {}) {
    const { accessToken, igUserId } = withCredentials(credentials);
    const videoUrl = assertPublicHttpsUrl(options.videoUrl, "video_url");
    const caption = buildInstagramCaption(options.caption, options.hashtags);
    const coverUrl = options.coverUrl
        ? assertPublicHttpsUrl(options.coverUrl, "cover_url")
        : null;

    logger.info(
        `instagram publishReel ig_user=${igUserId} video_url=${videoUrl} caption_len=${caption.length}`,
    );

    const params = {
        media_type: "REELS",
        video_url: videoUrl,
        caption: caption || undefined,
    };
    if (coverUrl) {
        params.cover_url = coverUrl;
    }

    const { creationId } = await createInstagramMediaContainer({
        accessToken,
        igUserId,
        params,
    });

    return publishInstagramContainer({
        accessToken,
        igUserId,
        creationId,
        timeoutMs: 600_000,
    });
}

/**
 * Story (image or video). Stickers/polls/links are not supported by the API.
 * @param {{ accessToken: string, igUserId: string } | ReturnType<typeof createInstagramClient>} credentials
 * @param {{ imageUrl?: string|null, videoUrl?: string|null }} options
 */
export async function publishStory(credentials, options = {}) {
    const { accessToken, igUserId } = withCredentials(credentials);
    const videoUrl = options.videoUrl
        ? assertPublicHttpsUrl(options.videoUrl, "video_url")
        : null;
    const imageUrl = !videoUrl && options.imageUrl
        ? assertPublicHttpsUrl(options.imageUrl, "image_url")
        : null;

    if (!videoUrl && !imageUrl) {
        throw new Error("publishStory requires imageUrl or videoUrl");
    }

    logger.info(
        `instagram publishStory ig_user=${igUserId} media=${videoUrl ? "video" : "image"}`,
    );

    const params = {
        media_type: "STORIES",
        ...(videoUrl ? { video_url: videoUrl } : { image_url: imageUrl }),
    };

    const { creationId } = await createInstagramMediaContainer({
        accessToken,
        igUserId,
        params,
    });

    return publishInstagramContainer({
        accessToken,
        igUserId,
        creationId,
        timeoutMs: videoUrl ? 600_000 : 180_000,
    });
}
