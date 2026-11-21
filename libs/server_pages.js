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
    serviceRunStatusBadgeClass,
    serviceRunStatusLabel,
} from "./server_run_status.js";

const ALIVE_WITHIN_SECONDS = 180;
const SERVICE_RUN_LIMIT = 15;

function enrichServiceRuns(runs) {
    return (Array.isArray(runs) ? runs : []).map((run) => {
        const run_status = resolveServiceRunStatus({
            success: run.success,
            result: run.result,
        });
        return {
            ...run,
            run_status,
            run_status_label: serviceRunStatusLabel(run_status),
            run_status_badge: serviceRunStatusBadgeClass(run_status),
        };
    });
}

function parseMetricPayload(row) {
    if (!row?.payload) {
        return null;
    }
    try {
        return typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    } catch {
        return null;
    }
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
