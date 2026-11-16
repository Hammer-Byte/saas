import {
    deleteServerById,
    getAllServers,
    getServerById,
    parseAlertEmailsColumn,
    updateServerAgentActiveById,
    updateServerAlertById,
    updateServerAlertSettingsById,
    updateServerApprovalById,
    updateServerNameById,
    updateServerProjectById,
} from "../db/servers.js";

function decorateServer(server) {
    if (!server) {
        return server;
    }
    return {
        ...server,
        alert_cpu_percent: Number(server.alert_cpu_percent),
        alert_memory_percent: Number(server.alert_memory_percent),
        alert_ping_seconds: Number(server.alert_ping_seconds),
        alert_cpu_enabled: Boolean(server.alert_cpu_enabled),
        alert_memory_enabled: Boolean(server.alert_memory_enabled),
        alert_ping_enabled: Boolean(server.alert_ping_enabled),
        alert_emails: parseAlertEmailsColumn(server.alert_emails),
    };
}
import { getServerMetricsByServerId } from "../db/server_metrics.js";
import {
    ensureServerService,
    getServerService,
    getServerServicesByServerId,
    updateServerServiceSettings,
} from "../db/server_services.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import { normalizeServiceAlertEmails } from "../libs/agent_services/common.js";
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
    return { servers: servers.map(decorateServer) };
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
    return {
        server: decorateServer(server),
        metrics,
        services: services.map(maskServiceRow),
    };
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

/** Alert settings only (emails + service alert flags). Does not require the full sync form. */
const SERVICE_ALERT_KEYS = {
    drivesync: ["alert_on_start", "alert_on_complete", "alert_emails"],
    monitor: ["alert_emails"],
};

const SERVICE_ALERT_AGENT_KEYS = {
    drivesync: ["alert_on_start", "alert_on_complete"],
};

export async function updateServerServiceAlerts({ params, body, set }) {
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
    const allowKeys = SERVICE_ALERT_KEYS[definition.id];
    if (!allowKeys) {
        set.status = 400;
        return { error: "This service does not support alert settings yet" };
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

    const patch = {};
    for (const key of allowKeys) {
        if (body[key] !== undefined) {
            patch[key] = body[key];
        }
    }
    if (Object.keys(patch).length === 0) {
        set.status = 400;
        return { error: "No alert settings provided" };
    }

    const mergedInput = { ...(row.config || {}), ...patch };
    const result = definition.validate(mergedInput, row.config);
    if (!result.ok) {
        set.status = 400;
        return { error: "Configuration is invalid", errors: result.errors };
    }

    const nextConfig = result.config;
    const agentKeys = SERVICE_ALERT_AGENT_KEYS[definition.id] || [];
    const agentFacingChanged = agentKeys.some(
        (key) => JSON.stringify(nextConfig[key]) !== JSON.stringify(row.config?.[key]),
    );
    const changed = JSON.stringify(nextConfig) !== JSON.stringify(row.config);

    await updateServerServiceSettings({
        id: row.id,
        enabled: row.enabled,
        config: nextConfig,
        bump_version: agentFacingChanged,
    });

    const saved = await getServerService({ server_id: server.id, service: definition.id });
    set.status = 200;
    return {
        message: agentFacingChanged
            ? "Alert settings saved - agent will restart the service"
            : changed
              ? "Alert settings saved"
              : "Saved",
        config: definition.maskForBrowser(saved?.config || {}),
        alert_emails: normalizeServiceAlertEmails(saved?.config?.alert_emails),
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
            const savedLegacy = await updateServerAlertSettingsById({
                id: server.id,
                alert_cpu_enabled: server.alert_cpu_enabled,
                alert_cpu_percent: server.alert_cpu_percent,
                alert_memory_enabled: body.alert,
                alert_memory_percent: server.alert_memory_percent ?? 80,
                alert_ping_enabled: server.alert_ping_enabled,
                alert_ping_seconds: server.alert_ping_seconds ?? 180,
                alert_emails: parseAlertEmailsColumn(server.alert_emails),
            });
            if (!savedLegacy) {
                set.status = 500;
                return {
                    error:
                        "Failed to save alert settings. If this is the first deploy of alert emails, run: ALTER TABLE SERVERS ADD COLUMN alert_emails TEXT NULL;",
                };
            }
        }
    }

    const hasAlertSettings =
        body.alert_cpu_enabled !== undefined ||
        body.alert_cpu_percent !== undefined ||
        body.alert_memory_enabled !== undefined ||
        body.alert_memory_percent !== undefined ||
        body.alert_ping_enabled !== undefined ||
        body.alert_ping_seconds !== undefined ||
        body.alert_emails !== undefined;

    if (hasAlertSettings) {
        const latest = await getServerById({ id: server.id });
        const pick = (key) => (body[key] !== undefined ? body[key] : latest?.[key]);
        const emailList =
            body.alert_emails !== undefined
                ? normalizeServiceAlertEmails(body.alert_emails)
                : parseAlertEmailsColumn(latest?.alert_emails);
        // Dual-write: SERVERS.alert_emails (legacy) + monitor service config (source of truth).
        const saved = await updateServerAlertSettingsById({
            id: server.id,
            alert_cpu_enabled: pick("alert_cpu_enabled"),
            alert_cpu_percent: Number(pick("alert_cpu_percent")),
            alert_memory_enabled: pick("alert_memory_enabled"),
            alert_memory_percent: Number(pick("alert_memory_percent")),
            alert_ping_enabled: pick("alert_ping_enabled"),
            alert_ping_seconds: Number(pick("alert_ping_seconds")),
            alert_emails: emailList.length ? emailList : null,
        });
        if (!saved) {
            set.status = 500;
            return {
                error:
                    "Failed to save alert settings. If this is the first deploy of alert emails, run: ALTER TABLE SERVERS ADD COLUMN alert_emails TEXT NULL;",
            };
        }

        if (body.alert_emails !== undefined) {
            await ensureServerService({
                server_id: server.id,
                service: "monitor",
                config: getDefaultConfig("monitor"),
            });
            const monitorRow = await getServerService({
                server_id: server.id,
                service: "monitor",
            });
            if (monitorRow) {
                const monitorDefinition = getAgentService("monitor");
                const mergedInput = {
                    ...(monitorRow.config || {}),
                    alert_emails: emailList,
                };
                const validated = monitorDefinition.validate(mergedInput, monitorRow.config);
                const nextConfig = validated.ok
                    ? validated.config
                    : { ...(monitorRow.config || {}), alert_emails: emailList };
                await updateServerServiceSettings({
                    id: monitorRow.id,
                    enabled: monitorRow.enabled,
                    config: nextConfig,
                    bump_version: false,
                });
            }
        }
    }

    const updatedServer = await getServerById({ id: server.id });
    set.status = 200;
    return { message: "Server updated", server: decorateServer(updatedServer) };
}

/** Removes the server row; metrics and service rows cascade via FK. */
export async function deleteMonitoredServer({ params, set }) {
    const server = await getServerById({ id: params.id });
    if (!server) {
        set.status = 404;
        return { error: "Server not found" };
    }

    await deleteServerById({ id: server.id });
    set.status = 200;
    return { message: "Server deleted" };
}
