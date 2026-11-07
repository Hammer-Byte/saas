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
                alert: t.Optional(t.Boolean()),
                alert_cpu_enabled: t.Optional(t.Boolean()),
                alert_cpu_percent: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
                alert_memory_enabled: t.Optional(t.Boolean()),
                alert_memory_percent: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
                alert_ping_enabled: t.Optional(t.Boolean()),
                alert_ping_seconds: t.Optional(t.Numeric({ minimum: 60, maximum: 604800 })),
            }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Update monitored server name, project, or alert settings",
            },
        });
}
