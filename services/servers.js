import {
    createServer,
    getAllServers,
    getServerById,
    getServerByTag,
    updateServerLastSeenById,
    updateServerNameById,
} from "../db/servers.js";
import { createServerMetric, getServerMetricsByServerId } from "../db/server_metrics.js";

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

    const agentVersion =
        body && typeof body === "object" && body.agent_version != null
            ? String(body.agent_version).slice(0, 32)
            : null;

    await updateServerLastSeenById({
        id: server.id,
        agent_version: agentVersion,
    });

    const payload = JSON.stringify(body ?? {});
    await createServerMetric({
        server_id: server.id,
        payload,
    });

    set.status = 200;
    return { ok: true, server_id: server.id };
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

    const name =
        body.name == null || String(body.name).trim() === ""
            ? null
            : String(body.name).trim().slice(0, 128);

    await updateServerNameById({ id: server.id, name });
    const updatedServer = await getServerById({ id: server.id });
    set.status = 200;
    return { message: "Server updated", server: updatedServer };
}
