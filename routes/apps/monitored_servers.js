import { t } from "elysia";
import {
    getMonitoredServer,
    getMonitoredServers,
    updateMonitoredServer,
} from "../../services/servers.js";

export default function (app) {
    return app
        .get("/", getMonitoredServers, {
            detail: {
                tags: ["Monitored Servers"],
                summary: "List monitored servers",
            },
        })
        .get("/:id", getMonitoredServer, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Get monitored server with metrics",
            },
        })
        .patch("/", updateMonitoredServer, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                name: t.Optional(
                    t.Union([t.String({ maxLength: 128 }), t.Literal(""), t.Null()]),
                ),
                project_id: t.Optional(
                    t.Union([t.Numeric({ minimum: 1 }), t.Null()]),
                ),
            }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Update monitored server name or project",
            },
        });
}
