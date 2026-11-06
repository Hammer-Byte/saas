/**
 * Instagram Graph Content Publishing library (image operations).
 *
 * Credentials (from Automation Users):
 *   - accessToken  → stored access token / API key
 *   - igUserId     → Instagram professional account id
 *
 * Video / Reels belong on the separate video content-publish tile later.
 *
 * Usage:
 *   import { createInstagramPublisher } from "../instagram/index.js";
 *
 *   const ig = createInstagramPublisher({ accessToken, igUserId });
 *   await ig.publishFeedImage({ imageUrl, caption });
 */

import { createInstagramClient } from "./client.js";
import {
    publishFeedCarousel,
    publishFeedImage,
    publishStory,
} from "./publish.js";

export { buildInstagramCaption } from "./caption.js";
export {
    assertPublicHttpsUrl,
    createInstagramClient,
    createInstagramMediaContainer,
    instagramGraphRequest,
    normalizeInstagramCredentials,
    publishInstagramContainer,
    waitForInstagramContainer,
} from "./client.js";
export {
    publishFeedCarousel,
    publishFeedImage,
    publishStory,
} from "./publish.js";

/** Client with image publish helpers bound to credentials. */
export function createInstagramPublisher({ accessToken, igUserId } = {}) {
    const client = createInstagramClient({ accessToken, igUserId });
    return {
        ...client,
        publishFeedImage: (options) => publishFeedImage(client, options),
        publishFeedCarousel: (options) => publishFeedCarousel(client, options),
        publishStory: (options) => publishStory(client, options),
    };
}
