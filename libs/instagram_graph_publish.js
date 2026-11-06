import { logger } from "@hammerbyte/utils";

const DEFAULT_GRAPH_BASE = "https://graph.facebook.com/v21.0";

function graphBase() {
    return String(Bun.env.INSTAGRAM_GRAPH_API_BASE || DEFAULT_GRAPH_BASE).replace(/\/+$/, "");
}

function buildCaption(caption, hashtags) {
    const parts = [String(caption || "").trim(), String(hashtags || "").trim()].filter(Boolean);
    return parts.join("\n\n");
}

async function graphRequest(path, { method = "GET", query = {}, body = null } = {}) {
    const url = new URL(`${graphBase()}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") {
            continue;
        }
        url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
        const graphError = data.error || {};
        const message =
            graphError.message
            || data.message
            || `Instagram Graph API HTTP ${response.status}`;
        const code = graphError.code ? ` code=${graphError.code}` : "";
        const subcode = graphError.error_subcode ? ` subcode=${graphError.error_subcode}` : "";
        throw new Error(`Instagram Graph API: ${message}${code}${subcode}`);
    }
    return data;
}

async function waitForContainerReady({ creationId, accessToken, timeoutMs = 120_000 }) {
    const deadline = Date.now() + timeoutMs;
    let lastStatus = null;
    while (Date.now() < deadline) {
        const status = await graphRequest(`/${creationId}`, {
            query: {
                fields: "status_code,status",
                access_token: accessToken,
            },
        });
        lastStatus = status.status_code || status.status || null;
        logger.info(
            `content-publish ig-api container=${creationId} status=${lastStatus || "?"}`,
        );
        if (String(lastStatus).toUpperCase() === "FINISHED") {
            return status;
        }
        if (String(lastStatus).toUpperCase() === "ERROR") {
            throw new Error(
                `Instagram media container failed status=${JSON.stringify(status)}`,
            );
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(
        `Instagram media container not ready after ${timeoutMs}ms (last=${lastStatus || "?"})`,
    );
}

/**
 * Publish a single feed image via Instagram Content Publishing API.
 * Requires a Professional (Business/Creator) IG account + access token with publish permission.
 */
export async function publishInstagramImageViaGraphApi({
    accessToken,
    igUserId,
    imageUrl,
    caption = null,
    hashtags = null,
}) {
    const token = String(accessToken || "").trim();
    const userId = String(igUserId || "").trim();
    const url = String(imageUrl || "").trim();
    if (!token) {
        throw new Error("Instagram access token is required");
    }
    if (!userId) {
        throw new Error("Instagram user id is required");
    }
    if (!/^https:\/\//i.test(url)) {
        throw new Error("Instagram image_url must be a public https URL");
    }

    const fullCaption = buildCaption(caption, hashtags);
    logger.info(
        `content-publish ig-api create container ig_user=${userId} image_url=${url} caption_len=${fullCaption.length}`,
    );

    const container = await graphRequest(`/${userId}/media`, {
        method: "POST",
        query: {
            image_url: url,
            caption: fullCaption || undefined,
            access_token: token,
        },
    });
    const creationId = container.id;
    if (!creationId) {
        throw new Error(`Instagram container create returned no id: ${JSON.stringify(container)}`);
    }
    logger.info(`content-publish ig-api container created id=${creationId}`);

    await waitForContainerReady({ creationId, accessToken: token });

    const published = await graphRequest(`/${userId}/media_publish`, {
        method: "POST",
        query: {
            creation_id: creationId,
            access_token: token,
        },
    });
    logger.info(
        `content-publish ig-api published media_id=${published.id || "?"} creation_id=${creationId}`,
    );
    return published;
}
