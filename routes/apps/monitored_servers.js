import { t } from "elysia";
import {
    addServer,
    deleteServer,
    unmapServerTag,
    updateServer,
    updateServerAlerts,
} from "../../services/servers.js";

export default function (app) {
    return app
        .post("/", addServer, {
            body: t.Object({
                name: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Name is required",
                }),
                location: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Location is required",
                }),
                project_id: t.Optional(t.Union([t.Numeric({ minimum: 1 }), t.Null()])),
                notes: t.Optional(t.Union([t.String({ maxLength: 4000 }), t.Null()])),
                active: t.Optional(t.Boolean()),
            }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Create server inventory record",
            },
        })
        .patch("/", updateServer, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                name: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Name is required",
                }),
                location: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Location is required",
                }),
                project_id: t.Optional(t.Union([t.Numeric({ minimum: 1 }), t.Null()])),
                notes: t.Optional(t.Union([t.String({ maxLength: 4000 }), t.Null()])),
                active: t.Boolean(),
            }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Update server inventory record",
            },
        })
        .delete("/:id", deleteServer, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Delete server inventory record",
            },
        })
        .patch("/:id/alerts", updateServerAlerts, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            body: t.Object(
                {
                    alert_config: t.Optional(t.Any()),
                    pinger: t.Optional(t.Any()),
                    metricer: t.Optional(t.Any()),
                    dataer: t.Optional(t.Any()),
                    dber: t.Optional(t.Any()),
                },
                { additionalProperties: true },
            ),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Update server alert configuration",
            },
        })
        .patch("/:id/unmap", unmapServerTag, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Monitored Servers"],
                summary: "Unmap server tag (set tag_mapped false)",
            },
        });
}
