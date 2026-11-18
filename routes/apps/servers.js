import { t } from "elysia";
import { handleServerRequest } from "../../services/servers.js";

export default function (app) {
    return app.post("/", handleServerRequest, {
        body: t.Object({
            TYPE: t.String({ minLength: 1 }),
            otp: t.String({ minLength: 1, maxLength: 16 }),
            timestamp: t.Optional(t.String()),
        }),
        detail: {
            tags: ["Servers"],
            summary: "Public server operations (TYPE CREATE_TAG)",
        },
    });
}
