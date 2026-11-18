import { getRecentServerDataerRunsByServerId } from "../db/server_dataer_runs.js";
import { getRecentServerDberRunsByServerId } from "../db/server_dber_runs.js";
import { getLatestServerMetricByServerId } from "../db/server_metrics.js";
import { getLatestServerPingByServerId } from "../db/server_pings.js";

const ALIVE_WITHIN_SECONDS = 180;
const SERVICE_RUN_LIMIT = 25;

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

export async function buildServerPageData(server) {
    const [latestPing, latestMetricRow, dataerRuns, dberRuns] = await Promise.all([
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
    ]);

    const secondsSincePing =
        latestPing?.seconds_since_received == null
            ? null
            : Number(latestPing.seconds_since_received);

    let aliveStatus = "unknown";
    if (secondsSincePing != null && Number.isFinite(secondsSincePing)) {
        aliveStatus = secondsSincePing <= ALIVE_WITHIN_SECONDS ? "alive" : "offline";
    }

    return {
        server,
        latestPing,
        aliveStatus,
        aliveWithinSeconds: ALIVE_WITHIN_SECONDS,
        metrics: parseMetricPayload(latestMetricRow),
        latestMetricReceivedOn: latestMetricRow?.received_on || null,
        dataerRuns,
        dberRuns,
    };
}
