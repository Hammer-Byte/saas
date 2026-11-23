import { getRecentServerDataerRunsByServerId } from "../db/server_dataer_runs.js";
import { getRecentServerDberRunsByServerId } from "../db/server_dber_runs.js";
import { getServerAlertLogsByServerIdAndDateRange } from "../db/server_alert_log.js";
import { getLatestServerMetricByServerId } from "../db/server_metrics.js";
import { getLatestServerPingByServerId } from "../db/server_pings.js";
import { getCustomerEmailsByCustomerId } from "../db/customer_emails.js";
import { getCustomerPhonesByCustomerId } from "../db/customer_phones.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import { serverAlertKindLabel } from "./server_alert_kinds.js";
import { buildAlertCandidates, listFixedStorageDrives, parseAlertConfig } from "./server_alerts.js";
import {
    resolveServiceRunStatus,
    serviceRunResultSummary,
    serviceRunStatusBadgeClass,
    serviceRunStatusLabel,
} from "./server_run_status.js";

const ALIVE_WITHIN_SECONDS = 180;
const SERVICE_RUN_LIMIT = 15;

function parseJsonObject(value) {
    if (value == null) {
        return null;
    }
    if (typeof value === "object") {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function asNameList(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function formatDatabaseLabel(names) {
    if (!names.length) {
        return null;
    }
    return names.join(", ");
}

/**
 * Normalize Metricer payload shapes for the detail UI.
 * Contract sends processes as an array; older payloads used { count, items }.
 * Storage may use driveType (contract) or type (legacy).
 */
export function normalizeMetricerPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return payload;
    }

    const normalized = { ...payload };

    if (Array.isArray(normalized.processes)) {
        normalized.processes = {
            count: normalized.processes.length,
            items: normalized.processes,
        };
    } else if (normalized.processes && typeof normalized.processes === "object") {
        const items = Array.isArray(normalized.processes.items)
            ? normalized.processes.items
            : [];
        const count =
            normalized.processes.count != null && Number.isFinite(Number(normalized.processes.count))
                ? Number(normalized.processes.count)
                : items.length;
        normalized.processes = { count, items };
    }

    if (Array.isArray(normalized.storage)) {
        normalized.storage = normalized.storage.map((disk) => {
            if (!disk || typeof disk !== "object") {
                return disk;
            }
            return {
                ...disk,
                type: disk.type || disk.driveType || "",
            };
        });
    }

    return normalized;
}

function enrichServiceRun(run) {
    const payload = parseJsonObject(run.payload);
    const succeededDatabases = asNameList(payload?.succeededDatabases);
    const failedDatabases = asNameList(payload?.failedDatabases);
    const databases = asNameList(payload?.databases);
    const eventNames = [...new Set([...failedDatabases, ...succeededDatabases])];
    const databaseLabel =
        formatDatabaseLabel(eventNames) ||
        formatDatabaseLabel(databases) ||
        null;

    const from_database = run.from_database || databaseLabel;
    const to_database =
        run.to_database ||
        (payload?.importToTarget ? databaseLabel : run.to_database) ||
        null;

    const run_status = resolveServiceRunStatus({
        success: run.success,
        result: run.result,
        successCount: payload?.successCount,
        failedCount: payload?.failedCount,
        succeededDatabases: succeededDatabases.length ? succeededDatabases : undefined,
        failedDatabases: failedDatabases.length ? failedDatabases : undefined,
    });

    return {
        ...run,
        from_database,
        to_database,
        succeeded_databases: succeededDatabases,
        failed_databases: failedDatabases,
        run_status,
        run_status_label: serviceRunStatusLabel(run_status),
        run_status_badge: serviceRunStatusBadgeClass(run_status),
        run_result_summary: serviceRunResultSummary(run.result),
    };
}

function enrichServiceRuns(runs) {
    return (Array.isArray(runs) ? runs : []).map(enrichServiceRun);
}

function parseMetricPayload(row) {
    return normalizeMetricerPayload(parseJsonObject(row?.payload));
}

async function loadAlertCandidatesForServer(server) {
    if (!server?.project_id) {
        return [];
    }
    const project = await getCustomerProjectById({ id: server.project_id });
    if (!project?.customer_id) {
        return [];
    }
    const [emails, phones] = await Promise.all([
        getCustomerEmailsByCustomerId({ customer_id: project.customer_id }),
        getCustomerPhonesByCustomerId({ customer_id: project.customer_id }),
    ]);
    return buildAlertCandidates({
        customerName: server.customer_name || "Contact",
        emails,
        phones,
    });
}

export async function buildServerPageData(server, { alertLogStart = null, alertLogEnd = null } = {}) {
    const [latestPing, latestMetricRow, dataerRuns, dberRuns, alertCandidates, alertLogs] =
        await Promise.all([
            getLatestServerPingByServerId({ server_id: server.id }),
            getLatestServerMetricByServerId({ server_id: server.id }),
            getRecentServerDataerRunsByServerId({
                server_id: server.id,
                limit: SERVICE_RUN_LIMIT,
            }),
            getRecentServerDberRunsByServerId({
                server_id: server.id,
                limit: SERVICE_RUN_LIMIT,
            }),
            loadAlertCandidatesForServer(server),
            alertLogStart && alertLogEnd
                ? getServerAlertLogsByServerIdAndDateRange({
                      server_id: server.id,
                      start: alertLogStart,
                      end: alertLogEnd,
                  })
                : Promise.resolve([]),
        ]);

    const secondsSincePing =
        latestPing?.seconds_since_received == null
            ? null
            : Number(latestPing.seconds_since_received);

    let aliveStatus = "unknown";
    if (secondsSincePing != null && Number.isFinite(secondsSincePing)) {
        aliveStatus = secondsSincePing <= ALIVE_WITHIN_SECONDS ? "alive" : "offline";
    }

    const metrics = parseMetricPayload(latestMetricRow);
    return {
        server,
        latestPing,
        aliveStatus,
        aliveWithinSeconds: ALIVE_WITHIN_SECONDS,
        metrics,
        latestMetricReceivedOn: latestMetricRow?.received_on || null,
        metricStorageDrives: listFixedStorageDrives(metrics),
        dataerRuns: enrichServiceRuns(dataerRuns),
        dberRuns: enrichServiceRuns(dberRuns),
        alertConfig: parseAlertConfig(server.alert_config),
        alertCandidates,
        alertLogs: (alertLogs || []).map((row) => ({
            ...row,
            kind_label: serverAlertKindLabel(row.kind),
        })),
        alertLogStart,
        alertLogEnd,
    };
}
