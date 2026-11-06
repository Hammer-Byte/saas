import { logger } from "@hammerbyte/utils";

const DEFAULT_GRAPH_BASE = "https://graph.facebook.com/v21.0";
const DEFAULT_CONTAINER_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 2_000;

function graphBase() {
    return String(Bun.env.INSTAGRAM_GRAPH_API_BASE || DEFAULT_GRAPH_BASE).replace(/\/+$/, "");
}

export function normalizeInstagramCredentials({ accessToken, igUserId } = {}) {
    const token = String(accessToken || "").trim();
    const userId = String(igUserId || "").trim();
    if (!token) {
        throw new Error("Instagram access token is required");
    }
    if (!userId) {
        throw new Error("Instagram user id is required");
    }
    if (!/^\d{5,}$/.test(userId)) {
        throw new Error(`Instagram user id must be numeric (got: ${userId})`);
    }
    return { accessToken: token, igUserId: userId };
}

export function assertPublicHttpsUrl(url, fieldName = "url") {
    const value = String(url || "").trim();
    if (!/^https:\/\//i.test(value)) {
        throw new Error(`Instagram ${fieldName} must be a public https URL`);
    }
    return value;
}

export async function instagramGraphRequest(path, { method = "GET", query = {}, body = null } = {}) {
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

export async function waitForInstagramContainer({
    creationId,
    accessToken,
    timeoutMs = DEFAULT_CONTAINER_TIMEOUT_MS,
} = {}) {
    const id = String(creationId || "").trim();
    const token = String(accessToken || "").trim();
    if (!id) {
        throw new Error("Instagram creation id is required");
    }
    if (!token) {
        throw new Error("Instagram access token is required");
    }

    const deadline = Date.now() + Math.max(10_000, Number(timeoutMs) || DEFAULT_CONTAINER_TIMEOUT_MS);
    let lastStatus = null;

    while (Date.now() < deadline) {
        const status = await instagramGraphRequest(`/${id}`, {
            query: {
                fields: "status_code,status",
                access_token: token,
            },
        });
        lastStatus = status.status_code || status.status || null;
        logger.info(`instagram container=${id} status=${lastStatus || "?"}`);

        const normalized = String(lastStatus || "").toUpperCase();
        if (normalized === "FINISHED") {
            return status;
        }
        if (normalized === "ERROR") {
            throw new Error(`Instagram media container failed status=${JSON.stringify(status)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(
        `Instagram media container not ready after timeout (last=${lastStatus || "?"})`,
    );
}

export async function createInstagramMediaContainer({
    accessToken,
    igUserId,
    params = {},
} = {}) {
    const { accessToken: token, igUserId: userId } = normalizeInstagramCredentials({
        accessToken,
        igUserId,
    });

    const container = await instagramGraphRequest(`/${userId}/media`, {
        method: "POST",
        query: {
            ...params,
            access_token: token,
        },
    });
    const creationId = container.id;
    if (!creationId) {
        throw new Error(`Instagram container create returned no id: ${JSON.stringify(container)}`);
    }
    logger.info(`instagram container created id=${creationId} ig_user=${userId}`);
    return { creationId, container };
}

export async function publishInstagramContainer({
    accessToken,
    igUserId,
    creationId,
    timeoutMs = DEFAULT_CONTAINER_TIMEOUT_MS,
} = {}) {
    const { accessToken: token, igUserId: userId } = normalizeInstagramCredentials({
        accessToken,
        igUserId,
    });
    const id = String(creationId || "").trim();
    if (!id) {
        throw new Error("Instagram creation id is required");
    }

    await waitForInstagramContainer({ creationId: id, accessToken: token, timeoutMs });

    const published = await instagramGraphRequest(`/${userId}/media_publish`, {
        method: "POST",
        query: {
            creation_id: id,
            access_token: token,
        },
    });
    logger.info(
        `instagram published media_id=${published.id || "?"} creation_id=${id} ig_user=${userId}`,
    );
    return published;
}

/**
 * Credential-scoped client for Instagram Graph Content Publishing.
 * accessToken + igUserId come from Automation Users.
 */
export function createInstagramClient({ accessToken, igUserId } = {}) {
    const credentials = normalizeInstagramCredentials({ accessToken, igUserId });
    return {
        credentials,
        createMediaContainer: (params) =>
            createInstagramMediaContainer({ ...credentials, params }),
        publishContainer: (creationId, options = {}) =>
            publishInstagramContainer({
                ...credentials,
                creationId,
                ...options,
            }),
        graphRequest: (path, options) => instagramGraphRequest(path, options),
    };
}
