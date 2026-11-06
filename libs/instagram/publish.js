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
 * Feed carousel (2–10 images). Video items belong on the video tile later.
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
 * Image story. Stickers/polls/links are not supported by the API.
 * Video stories belong on the video tile later.
 * @param {{ accessToken: string, igUserId: string } | ReturnType<typeof createInstagramClient>} credentials
 * @param {{ imageUrl: string }} options
 */
export async function publishStory(credentials, options = {}) {
    const { accessToken, igUserId } = withCredentials(credentials);
    const imageUrl = assertPublicHttpsUrl(options.imageUrl, "image_url");

    logger.info(`instagram publishStory ig_user=${igUserId} media=image`);

    const { creationId } = await createInstagramMediaContainer({
        accessToken,
        igUserId,
        params: {
            media_type: "STORIES",
            image_url: imageUrl,
        },
    });

    return publishInstagramContainer({
        accessToken,
        igUserId,
        creationId,
        timeoutMs: 180_000,
    });
}
