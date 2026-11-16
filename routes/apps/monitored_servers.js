import { t } from "elysia";
import {
    deleteMonitoredServer,
    getMonitoredServer,
    getMonitoredServers,
    updateMonitoredServer,
    updateServerAgent,
    updateServerApproval,
    updateServerServiceConfig,
} from "../../services/servers.js";

export default function (app) {
    return app
        .delete("/:id", deleteMonitoredServer, {
            params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Delete a server and all of its metrics and service rows",
            },
        })
        .patch("/:id/approval", updateServerApproval, {
            params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
            body: t.Object({
                approval_status: t.Union([
                    t.Literal("pending"),
                    t.Literal("approved"),
                    t.Literal("rejected"),
                ]),
            }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Approve, reject or reset a server's agent",
            },
        })
        .patch("/:id/agent", updateServerAgent, {
            params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
            body: t.Object({ agent_active: t.Boolean() }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Activate or pause the agent (paused agents stop all services)",
            },
        })
        .patch("/:id/services/:service", updateServerServiceConfig, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
                service: t.String({ minLength: 1, maxLength: 32 }),
            }),
            body: t.Object({
                enabled: t.Optional(t.Boolean()),
                config: t.Optional(t.Object({}, { additionalProperties: true })),
            }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Enable/disable a service and save its config",
            },
        })
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
                alert_emails: t.Optional(t.Array(t.String({ maxLength: 254 }), { maxItems: 50 })),
            }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Update monitored server name, project, or alert settings",
            },
        });
}
