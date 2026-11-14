import { t } from "elysia";
import { pollAgent, registerAgent } from "../../services/agent_hub.js";

export default function (app) {
    return app
        .post("/register", registerAgent, {
            body: t.Object({}, { additionalProperties: true }),
            detail: {
                tags: ["Agent"],
                summary: "Register a HammerByte Agent install (stays pending until approved)",
            },
        })
        .post("/poll", pollAgent, {
            body: t.Object({}, { additionalProperties: true }),
            detail: {
                tags: ["Agent"],
                summary: "Agent poll: report service status, receive desired state (X-Server-Tag header required)",
            },
        });
}
