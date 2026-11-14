import {
    getAllServers,
    getServerById,
    updateServerAgentActiveById,
    updateServerAlertById,
    updateServerAlertSettingsById,
    updateServerApprovalById,
    updateServerNameById,
    updateServerProjectById,
} from "../db/servers.js";
import { getServerMetricsByServerId } from "../db/server_metrics.js";
import {
    ensureServerService,
    getServerService,
    getServerServicesByServerId,
    updateServerServiceSettings,
} from "../db/server_services.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import { getAgentService, getDefaultConfig } from "../libs/agent_services/index.js";

const APPROVAL_STATUSES = new Set(["pending", "approved", "rejected"]);

/** Service rows as the browser should see them (secrets masked). */
export function maskServiceRow(row) {
    const definition = getAgentService(row.service);
    return {
        ...row,
        config: definition ? definition.maskForBrowser(row.config || {}) : {},
    };
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

    const [metrics, services] = await Promise.all([
        getServerMetricsByServerId({ server_id: server.id }),
        getServerServicesByServerId({ server_id: server.id }),
    ]);
    set.status = 200;
    return { server, metrics, services: services.map(maskServiceRow) };
}

export async function updateServerApproval({ params, body, set }) {
    const server = await getServerById({ id: params.id });
    if (!server) {
        set.status = 404;
        return { error: "Server not found" };
    }
    const status = String(body.approval_status || "").toLowerCase();
    if (!APPROVAL_STATUSES.has(status)) {
        set.status = 400;
        return { error: "approval_status must be pending, approved or rejected" };
    }
    await updateServerApprovalById({ id: server.id, approval_status: status });
    set.status = 200;
    return { message: `Server ${status}`, server: await getServerById({ id: server.id }) };
}

export async function updateServerAgent({ params, body, set }) {
    const server = await getServerById({ id: params.id });
    if (!server) {
        set.status = 404;
        return { error: "Server not found" };
    }
    await updateServerAgentActiveById({ id: server.id, agent_active: body.agent_active });
    set.status = 200;
    return {
        message: body.agent_active ? "Agent activated" : "Agent paused",
        server: await getServerById({ id: server.id }),
    };
}

/**
 * Save a service's config and/or enabled flag.
 * The config version only bumps when the effective config changes, so the agent restarts only then.
 */
export async function updateServerServiceConfig({ params, body, set }) {
    const server = await getServerById({ id: params.id });
    if (!server) {
        set.status = 404;
        return { error: "Server not found" };
    }
    const definition = getAgentService(params.service);
    if (!definition) {
        set.status = 404;
        return { error: "Unknown service" };
    }

    await ensureServerService({
        server_id: server.id,
        service: definition.id,
        config: getDefaultConfig(definition.id),
    });
    const row = await getServerService({ server_id: server.id, service: definition.id });
    if (!row) {
        set.status = 500;
        return { error: "Failed to load service" };
    }

    const enabled = body.enabled === undefined ? row.enabled : Boolean(body.enabled);
    const source = body.config === undefined ? row.config : body.config;
    const result = definition.validate(source, row.config);

    if (!result.ok && (body.config !== undefined || enabled)) {
        set.status = 400;
        return {
            error: enabled && body.config === undefined
                ? "Complete the configuration before enabling this service"
                : "Configuration is invalid",
            errors: result.errors,
        };
    }

    const nextConfig = result.ok ? result.config : row.config;
    const changed = JSON.stringify(nextConfig) !== JSON.stringify(row.config);
    await updateServerServiceSettings({
        id: row.id,
        enabled,
        config: nextConfig,
        bump_version: changed,
    });

    const saved = await getServerService({ server_id: server.id, service: definition.id });
    set.status = 200;
    return {
        message: changed ? "Configuration saved - agent will restart the service" : "Saved",
        service: maskServiceRow(saved),
    };
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
        const pick = (key) => (body[key] !== undefined ? body[key] : latest?.[key]);
        await updateServerAlertSettingsById({
            id: server.id,
            alert_cpu_enabled: pick("alert_cpu_enabled"),
            alert_cpu_percent: pick("alert_cpu_percent"),
            alert_memory_enabled: pick("alert_memory_enabled"),
            alert_memory_percent: pick("alert_memory_percent"),
            alert_ping_enabled: pick("alert_ping_enabled"),
            alert_ping_seconds: pick("alert_ping_seconds"),
        });
    }

    const updatedServer = await getServerById({ id: server.id });
    set.status = 200;
    return { message: "Server updated", server: updatedServer };
}
