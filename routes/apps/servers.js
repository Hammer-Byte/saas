import { t } from "elysia";
import { ingestServiceResult } from "../../services/agent_hub.js";

export default function (app) {
    return app.post("/metrics", ingestServiceResult, {
        body: t.Object({}, { additionalProperties: true }),
        detail: {
            tags: ["Servers"],
            summary: "Ingest agent service results (X-Server-Tag header required)",
        },
    });
}
