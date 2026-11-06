/**
 * Instagram Graph Content Publishing library.
 *
 * Credentials (from Automation Users):
 *   - accessToken  → stored access token / API key
 *   - igUserId     → Instagram professional account id
 *
 * Usage:
 *   import { createInstagramPublisher } from "../instagram/index.js";
 *
 *   const ig = createInstagramPublisher({ accessToken, igUserId });
 *   await ig.publishFeedImage({ imageUrl, caption });
 *   await ig.publishReel({ videoUrl, caption });
 *   await ig.publishStory({ imageUrl }); // or { videoUrl }
 */

import { createInstagramClient } from "./client.js";
import {
    publishFeedCarousel,
    publishFeedImage,
    publishReel,
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
    publishReel,
    publishStory,
} from "./publish.js";

/** Client with publish helpers bound to credentials. */
export function createInstagramPublisher({ accessToken, igUserId } = {}) {
    const client = createInstagramClient({ accessToken, igUserId });
    return {
        ...client,
        publishFeedImage: (options) => publishFeedImage(client, options),
        publishFeedCarousel: (options) => publishFeedCarousel(client, options),
        publishReel: (options) => publishReel(client, options),
        publishStory: (options) => publishStory(client, options),
    };
}
