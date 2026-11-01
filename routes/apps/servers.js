import { t } from "elysia";
import { addServerMetrics } from "../../services/servers.js";

export default function (app) {
    return app.post("/metrics", addServerMetrics, {
        body: t.Object({}, { additionalProperties: true }),
        detail: {
            tags: ["Servers"],
            summary: "Ingest server metrics (X-Server-Tag header required)",
        },
    });
}
