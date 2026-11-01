import { t } from "elysia";
import { deleteServerMetrics, getServerMetrics } from "../../services/server_metrics.js";

export default function (app) {
    return app
        .get("/", getServerMetrics, {
            query: t.Object({
                server_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Server Metrics"],
                summary: "List metrics for a server",
            },
        })
        .delete("/", deleteServerMetrics, {
            body: t.Object({
                server_ids: t.Array(t.Numeric({ minimum: 1 }), { minItems: 1 }),
                mode: t.Union([t.Literal("all"), t.Literal("range")]),
                from: t.Optional(t.String({ minLength: 10, maxLength: 10 })),
                to: t.Optional(t.String({ minLength: 10, maxLength: 10 })),
            }),
            detail: {
                tags: ["Server Metrics"],
                summary: "Delete metrics for selected servers",
            },
        });
}
