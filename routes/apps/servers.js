import { t } from "elysia";
import { handleServerRequest } from "../../services/servers.js";

export default function (app) {
    return app.post("/", handleServerRequest, {
        body: t.Object(
            {
                TYPE: t.String({ minLength: 1 }),
            },
            { additionalProperties: true },
        ),
        detail: {
            tags: ["Servers"],
            summary: "Public server operations (CREATE_TAG, PINGER, Metricer, Dataer, DBer)",
        },
    });
}
