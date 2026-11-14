import { createHash } from "node:crypto";
import { logger } from "@hammerbyte/utils";
import {
    createServer,
    getServerByTag,
    updateServerHostInfoById,
    updateServerPollById,
} from "../db/servers.js";
import {
    ensureServerService,
    getServerServicesByServerId,
    touchServerServiceResult,
    updateServerServiceStatus,
} from "../db/server_services.js";
import { createServerMetric } from "../db/server_metrics.js";
import { getAgentService, getDefaultConfig, listAgentServices } from "../libs/agent_services/index.js";
import { notifyServerMetricAlertsIfNeeded } from "../libs/server_alert_notify.js";
import { getLatestReleaseMap } from "./agent_releases.js";

const TAG_PATTERN = /^[A-Za-z0-9._-]{6,64}$/;
const SERVICE_STATES = new Set(["running", "starting", "stopped", "backoff", "error", "disabled"]);
const RESULT_TYPES = new Set(["heartbeat", "metrics", "sync_run"]);
const MAX_RESULT_BYTES = 2 * 1024 * 1024;

function readTag(request) {
    const tag = String(request.headers.get("x-server-tag") || "").trim();
    return TAG_PATTERN.test(tag) ? tag : "";
}

function text(value, max) {
    if (value == null) {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed ? trimmed.slice(0, max) : null;
}

function intOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

function readHost(body) {
    const platform = body?.platform && typeof body.platform === "object" ? body.platform : {};
    return {
        hostname: platform.hostname,
        os_caption: platform.os_caption,
        os_build: platform.os_build,
        ps_version: platform.ps_version,
        platform_family: platform.family,
    };
}

async function findOrCreateServer(tag, body) {
    let server = await getServerByTag({ tag });
    if (server) {
        return server;
    }
    const id = await createServer({ tag, approval_status: "pending", host: readHost(body) });
    if (!id) {
        // Lost a race with a concurrent register for the same tag.
        return await getServerByTag({ tag });
    }
    logger.info(`agent registered (pending approval): ${tag}`);
    return await getServerByTag({ tag });
}

async function loadServiceRows(serverId) {
    let rows = await getServerServicesByServerId({ server_id: serverId });
    const known = new Set(rows.map((row) => row.service));
    const missing = listAgentServices().filter((service) => !known.has(service.id));
    if (missing.length) {
        for (const service of missing) {
            await ensureServerService({
                server_id: serverId,
                service: service.id,
                config: getDefaultConfig(service.id),
            });
        }
        rows = await getServerServicesByServerId({ server_id: serverId });
    }
    return rows;
}

function buildDesiredState({ server, rows, releases }) {
    const approved = server.approval_status === "approved";
    const agentActive = Boolean(server.agent_active);
    const runnable = approved && agentActive;
    const agentRelease = releases.agent;

    const services = {};
    for (const service of listAgentServices()) {
        const row = rows.find((r) => r.service === service.id);
        const script = releases[service.id];
        if (!runnable || !row || !row.enabled || !script) {
            services[service.id] = { enabled: false };
            continue;
        }
        services[service.id] = {
            enabled: true,
            config_version: Number(row.config_version) || 1,
            config: row.config,
            script: { version: script.version, url: script.url, sha256: script.sha256 },
        };
    }

    return {
        approved,
        approval_status: server.approval_status,
        agent_active: agentActive,
        agent:
            approved && agentRelease
                ? {
                      latest_version: agentRelease.version,
                      url: agentRelease.url,
                      sha256: agentRelease.sha256,
                  }
                : null,
        services,
    };
}

function computeEtag(state) {
    return createHash("sha1").update(JSON.stringify(state)).digest("hex");
}

async function recordServiceStatuses(server, reported) {
    if (!reported || typeof reported !== "object") {
        return;
    }
    for (const [serviceId, status] of Object.entries(reported)) {
        if (!getAgentService(serviceId) || !status || typeof status !== "object") {
            continue;
        }
        const state = String(status.state || "").toLowerCase();
        await updateServerServiceStatus({
            server_id: server.id,
            service: serviceId,
            state: SERVICE_STATES.has(state) ? state : "error",
            pid: intOrNull(status.pid),
            running_script_version: text(status.script_version, 32),
            running_config_version: intOrNull(status.config_version),
            restarts: Math.max(0, intOrNull(status.restarts) ?? 0),
            last_error: text(status.last_error, 512),
        });
    }
}

/** POST /api/agent/register — first contact from a fresh install (or reinstall). */
export async function registerAgent({ body, set }) {
    const tag = text(body?.tag, 64);
    if (!tag || !TAG_PATTERN.test(tag)) {
        set.status = 400;
        return { error: "tag must be 6-64 characters of letters, digits, dot, dash or underscore" };
    }
    const server = await findOrCreateServer(tag, body);
    if (!server) {
        set.status = 500;
        return { error: "Failed to register server" };
    }
    await updateServerHostInfoById({ id: server.id, host: readHost(body) });
    set.status = 200;
    return { tag: server.tag, approval_status: server.approval_status };
}

/** POST /api/agent/poll — every 10s; returns desired state or `unchanged`. */
export async function pollAgent({ request, body, set }) {
    const tag = readTag(request);
    if (!tag) {
        set.status = 400;
        return { error: "valid X-Server-Tag header is required" };
    }
    const server = await findOrCreateServer(tag, body);
    if (!server) {
        set.status = 500;
        return { error: "Failed to load server" };
    }

    const update = body?.update && typeof body.update === "object" ? body.update : {};
    await updateServerPollById({
        id: server.id,
        agent_version: body?.agent_version,
        agent_update_status: update.status,
        agent_update_error: update.error,
    });
    if (body?.platform) {
        await updateServerHostInfoById({ id: server.id, host: readHost(body) });
    }

    const rows = await loadServiceRows(server.id);
    if (server.approval_status === "approved") {
        await recordServiceStatuses(server, body?.services);
    }

    const releases = await getLatestReleaseMap();
    const state = buildDesiredState({ server, rows, releases });
    const etag = computeEtag(state);

    set.status = 200;
    if (body?.etag && body.etag === etag) {
        return { etag, unchanged: true };
    }
    return { etag, unchanged: false, ...state };
}

/** POST /api/servers/metrics — results submitted by service child processes. */
export async function ingestServiceResult({ request, body, set }) {
    const tag = readTag(request);
    if (!tag) {
        set.status = 400;
        return { error: "valid X-Server-Tag header is required" };
    }
    const server = await getServerByTag({ tag });
    if (!server || server.approval_status !== "approved" || !server.agent_active) {
        set.status = 403;
        return { error: "server is not approved or agent is inactive" };
    }

    const serviceId = String(body?.service || "").toLowerCase();
    const type = String(body?.type || "").toLowerCase();
    if (!getAgentService(serviceId)) {
        set.status = 400;
        return { error: "unknown service" };
    }
    if (!RESULT_TYPES.has(type)) {
        set.status = 400;
        return { error: "type must be heartbeat, metrics or sync_run" };
    }

    await touchServerServiceResult({ server_id: server.id, service: serviceId });

    if (type === "heartbeat") {
        set.status = 200;
        return { ok: true };
    }

    const payload = JSON.stringify(body);
    if (payload.length > MAX_RESULT_BYTES) {
        set.status = 413;
        return { error: "result payload too large" };
    }
    await createServerMetric({ server_id: server.id, service: serviceId, type, payload });

    if (type === "metrics") {
        await notifyServerMetricAlertsIfNeeded({ server, body });
    }

    set.status = 200;
    return { ok: true };
}
