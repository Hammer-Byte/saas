import {
    createServer,
    getAllServers,
    getServerById,
    getServerByTag,
    updateServerLastSeenById,
    updateServerNameById,
    updateServerProjectById,
    updateServerAlertById,
    updateServerAlertSettingsById,
    updateServerSyncStatusById,
} from "../db/servers.js";
import { createServerMetric, getServerMetricsByServerId } from "../db/server_metrics.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import { notifyServerMetricAlertsIfNeeded } from "../libs/server_alert_notify.js";

export async function addServerMetrics({ request, body, set }) {
    const tag = String(request.headers.get("x-server-tag") || "").trim();
    if (!tag) {
        set.status = 400;
        return { error: "X-Server-Tag header is required" };
    }

    let server = await getServerByTag({ tag });
    if (!server) {
        const serverId = await createServer({ tag });
        if (!serverId) {
            set.status = 400;
            return { error: "Failed to register server" };
        }
        server = await getServerByTag({ tag });
        if (!server) {
            set.status = 400;
            return { error: "Failed to load registered server" };
        }
    }

    const payloadType =
        body && typeof body === "object"
            ? String(body.type || "").toLowerCase()
            : "";
    // Three payload kinds: ping (alive), metrics (full snapshot), drive_sync.
    const isPing = payloadType === "ping";
    const isDriveSync = payloadType === "drive_sync";
    const isMetrics = !isPing && !isDriveSync;

    const agentVersion =
        body && typeof body === "object" && body.agent_version != null
            ? String(body.agent_version).slice(0, 32)
            : null;

    if (isDriveSync) {
        const status = String(body.status || "error").slice(0, 16);
        const totals = body.totals && typeof body.totals === "object" ? body.totals : {};
        const summary = [
            `status=${status}`,
            `copied=${totals.copied ?? 0}`,
            `deleted=${totals.deleted ?? 0}`,
            `skipped=${totals.skipped ?? 0}`,
            `failed=${totals.failed ?? 0}`,
            body.source_host ? `source=${body.source_host}` : null,
        ]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 512);

        await updateServerSyncStatusById({
            id: server.id,
            last_sync_status: status,
            last_sync_summary: summary,
        });
    } else if (isPing || isMetrics) {
        // Ping keeps last_seen_at fresh for alive alerts; metrics also bump it.
        await updateServerLastSeenById({
            id: server.id,
            agent_version: agentVersion,
        });
    }

    // Do not store ping rows — they are high-frequency alive signals only.
    if (!isPing) {
        const payload = JSON.stringify(body ?? {});
        await createServerMetric({
            server_id: server.id,
            payload,
        });
    }

    if (isMetrics) {
        await notifyServerMetricAlertsIfNeeded({ server, body });
    }

    set.status = 200;
    return { ok: true, server_id: server.id, type: payloadType || "metrics" };
}

export async function getMonitoredServers({ set }) {
    const servers = await getAllServers();
    set.status = 200;
    return { servers };
}

export async function getMonitoredServer({ params, set }) {
    const server = await getServerById({ id: params.id });
    if (!server) {
        set.status = 404;
        return { error: "Server not found" };
    }

    const metrics = await getServerMetricsByServerId({ server_id: server.id });
    set.status = 200;
    return { server, metrics };
}

export async function updateMonitoredServer({ body, set }) {
    const server = await getServerById({ id: body.id });
    if (!server) {
        set.status = 404;
        return { error: "Server not found" };
    }

    if (body.name !== undefined) {
        const name =
            body.name == null || String(body.name).trim() === ""
                ? null
                : String(body.name).trim().slice(0, 128);
        await updateServerNameById({ id: server.id, name });
    }

    if (body.project_id !== undefined) {
        if (body.project_id != null) {
            const existingProject = await getCustomerProjectById({ id: body.project_id });
            if (!existingProject) {
                set.status = 404;
                return { error: "Project not found" };
            }
        }
        await updateServerProjectById({ id: server.id, project_id: body.project_id });
    }

    if (body.alert !== undefined) {
        await updateServerAlertById({ id: server.id, alert: body.alert });
        if (body.alert_memory_enabled === undefined) {
            await updateServerAlertSettingsById({
                id: server.id,
                alert_cpu_enabled: server.alert_cpu_enabled,
                alert_cpu_percent: server.alert_cpu_percent,
                alert_memory_enabled: body.alert,
                alert_memory_percent: server.alert_memory_percent ?? 80,
                alert_ping_enabled: server.alert_ping_enabled,
                    alert_ping_seconds: server.alert_ping_seconds ?? 180,
            });
        }
    }

    const hasAlertSettings =
        body.alert_cpu_enabled !== undefined ||
        body.alert_cpu_percent !== undefined ||
        body.alert_memory_enabled !== undefined ||
        body.alert_memory_percent !== undefined ||
        body.alert_ping_enabled !== undefined ||
        body.alert_ping_seconds !== undefined;

    if (hasAlertSettings) {
        const latest = await getServerById({ id: server.id });
        await updateServerAlertSettingsById({
            id: server.id,
            alert_cpu_enabled:
                body.alert_cpu_enabled !== undefined
                    ? body.alert_cpu_enabled
                    : latest?.alert_cpu_enabled,
            alert_cpu_percent:
                body.alert_cpu_percent !== undefined
                    ? body.alert_cpu_percent
                    : latest?.alert_cpu_percent,
            alert_memory_enabled:
                body.alert_memory_enabled !== undefined
                    ? body.alert_memory_enabled
                    : latest?.alert_memory_enabled,
            alert_memory_percent:
                body.alert_memory_percent !== undefined
                    ? body.alert_memory_percent
                    : latest?.alert_memory_percent,
            alert_ping_enabled:
                body.alert_ping_enabled !== undefined
                    ? body.alert_ping_enabled
                    : latest?.alert_ping_enabled,
            alert_ping_seconds:
                body.alert_ping_seconds !== undefined
                    ? body.alert_ping_seconds
                    : latest?.alert_ping_seconds,
        });
    }

    const updatedServer = await getServerById({ id: server.id });
    set.status = 200;
    return { message: "Server updated", server: updatedServer };
}
