import { getServerById } from "../db/servers.js";
import {
    deleteServerMetricsByServerIds,
    deleteServerMetricsByServerIdsAndDateRange,
    getServerMetricsByServerId,
} from "../db/server_metrics.js";
import { parseQueryDate } from "../libs/date.js";

export async function getServerMetrics({ query, set }) {
    const serverId = Number(query.server_id);
    if (!serverId) {
        set.status = 400;
        return { error: "server_id is required" };
    }

    const server = await getServerById({ id: serverId });
    if (!server) {
        set.status = 404;
        return { error: "Server not found" };
    }

    const metrics = await getServerMetricsByServerId({ server_id: serverId });
    set.status = 200;
    return { metrics };
}

export async function deleteServerMetrics({ body, set }) {
    const serverIds = Array.isArray(body.server_ids)
        ? body.server_ids.map((id) => Number(id)).filter((id) => id >= 1)
        : [];

    if (!serverIds.length) {
        set.status = 400;
        return { error: "server_ids is required" };
    }

    for (const serverId of serverIds) {
        const server = await getServerById({ id: serverId });
        if (!server) {
            set.status = 404;
            return { error: `Server not found: ${serverId}` };
        }
    }

    if (body.mode === "all") {
        await deleteServerMetricsByServerIds({ server_ids: serverIds });
        set.status = 200;
        return { message: "Logs deleted" };
    }

    if (body.mode === "range") {
        const fromDate = parseQueryDate(body.from);
        const toDate = parseQueryDate(body.to);
        if (!fromDate || !toDate) {
            set.status = 400;
            return { error: "from and to dates are required (dd/mm/yyyy)" };
        }

        const rangeStart = fromDate <= toDate ? fromDate : toDate;
        const rangeEnd = fromDate <= toDate ? toDate : fromDate;

        await deleteServerMetricsByServerIdsAndDateRange({
            server_ids: serverIds,
            from_date: rangeStart,
            to_date: rangeEnd,
        });
        set.status = 200;
        return { message: "Logs deleted" };
    }

    set.status = 400;
    return { error: "mode must be all or range" };
}
