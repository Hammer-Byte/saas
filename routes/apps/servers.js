import { t } from "elysia";
import { addServerMetrics } from "../../services/servers.js";
import {
    getLatestServerAgentBinary,
    getLatestServerSupervisorBinary,
} from "../../services/server_monitor_releases.js";

export default function (app) {
    return app
        .post("/metrics", addServerMetrics, {
            body: t.Object({}, { additionalProperties: true }),
            detail: {
                tags: ["Servers"],
                summary: "Ingest server metrics (X-Server-Tag header required)",
            },
        })
        .get("/agent", getLatestServerAgentBinary, {
            detail: {
                tags: ["Servers"],
                summary: "Download latest agent.exe",
            },
        })
        .get("/supervisor", getLatestServerSupervisorBinary, {
            detail: {
                tags: ["Servers"],
                summary: "Download latest supervisor.exe",
            },
        });
}
