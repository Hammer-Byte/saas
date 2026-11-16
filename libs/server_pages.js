import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAllServers, parseAlertEmailsColumn } from "../db/servers.js";
import { getAllServerServices, getServerServicesByServerId } from "../db/server_services.js";
import { getServerMetricsByService } from "../db/server_metrics.js";
import { getAllAgentReleases } from "../db/agent_releases.js";
import { resolveServiceAlertEmails } from "./agent_services/common.js";
import { describeAgentServices, getAgentService } from "./agent_services/index.js";
import { listServerAlertCandidates } from "./server_alert_notify.js";

/** Default online window for the default 10s poll (three missed polls + slack). */
const DEFAULT_ONLINE_WINDOW_SECONDS = 35;

function onlineWindowSeconds(server) {
    const poll = Number(server.poll_seconds);
    const pollSeconds = Number.isFinite(poll) && poll > 0 ? poll : 10;
    return Math.max(DEFAULT_ONLINE_WINDOW_SECONDS, pollSeconds * 3 + 5);
}

function agentStatus(server) {
    const age = server.seconds_since_poll == null ? null : Math.max(0, Number(server.seconds_since_poll));
    return {
        online: age != null && age <= onlineWindowSeconds(server),
        seconds_since_poll: age,
    };
}

function parsePayload(row) {
    try {
        return typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload || {};
    } catch {
        return {};
    }
}

export async function buildServersPageData() {
    const [servers, serviceRows] = await Promise.all([getAllServers(), getAllServerServices()]);
    const definitions = describeAgentServices();
    const rowsByServer = new Map();
    for (const row of serviceRows) {
        if (!rowsByServer.has(row.server_id)) rowsByServer.set(row.server_id, []);
        rowsByServer.get(row.server_id).push(row);
    }
    const decorated = servers.map((server) => {
        const rows = rowsByServer.get(server.id) || [];
        return {
            ...server,
            ...agentStatus(server),
            services: definitions.map((definition) => {
                const row = rows.find((r) => r.service === definition.id);
                return {
                    id: definition.id,
                    label: definition.label,
                    enabled: Boolean(row?.enabled),
                    state: row?.state || null,
                    last_error: row?.last_error || null,
                };
            }),
        };
    });
    return {
        pendingServers: decorated.filter((server) => server.approval_status === "pending"),
        servers: decorated.filter((server) => server.approval_status !== "pending"),
    };
}

export async function buildServerPageData(server) {
    const rows = await getServerServicesByServerId({ server_id: server.id });
    const serverAlertEmails = parseAlertEmailsColumn(server.alert_emails);
    const alertEmailCandidates = await listServerAlertCandidates({ server });
    const serviceTabs = await Promise.all(
        describeAgentServices().map(async (definition) => {
            const service = getAgentService(definition.id);
            const row = rows.find((r) => r.service === definition.id);
            const rawConfig = row ? row.config : service.defaults;
            const alertEmails = resolveServiceAlertEmails(rawConfig, serverAlertEmails);
            const resultRows = await getServerMetricsByService({
                server_id: server.id,
                service: definition.id,
                limit: definition.id === "monitor" ? 50 : 30,
            });
            return {
                ...definition,
                row: {
                    enabled: Boolean(row?.enabled),
                    config_version: row?.config_version ?? 0,
                    state: row?.state || null,
                    pid: row?.pid ?? null,
                    running_script_version: row?.running_script_version || null,
                    running_config_version: row?.running_config_version ?? null,
                    restarts: row?.restarts ?? 0,
                    last_error: row?.last_error || null,
                    last_status_at: row?.last_status_at || null,
                    last_result_at: row?.last_result_at || null,
                    config: service.maskForBrowser(rawConfig || {}),
                },
                alert_emails: alertEmails,
                extra_alert_emails: alertEmails.filter(
                    (email) =>
                        !alertEmailCandidates.some((candidate) => candidate.email === email),
                ),
                results: resultRows.map((result) => ({
                    id: result.id,
                    type: result.type,
                    collected_at: result.collected_at,
                    data: parsePayload(result),
                })),
            };
        }),
    );

    return {
        server: {
            ...server,
            ...agentStatus(server),
            alert_emails: serverAlertEmails,
        },
        serviceTabs,
        alertEmailCandidates,
    };
}

export async function buildAgentReleasesPageData() {
    const releases = await getAllAgentReleases();
    const publicRoot = join(process.cwd());
    const components = new Map();
    for (const release of releases) {
        if (!components.has(release.component)) components.set(release.component, []);
        components.get(release.component).push({
            ...release,
            file_exists: existsSync(join(publicRoot, release.file_path.replace(/^\//, ""))),
        });
    }
    return {
        components: Array.from(components, ([component, items]) => ({ component, releases: items })),
        zipExists: existsSync(join(publicRoot, "public", "agents", "hammerbyte-agent.zip")),
    };
}
