import { t } from "elysia";
import {
    addApplicationService,
    updateApplicationService,
} from "../../services/application_services.js";

export default function (app) {
    return app
        .post("/", addApplicationService, {
            body: t.Object({
                application_id: t.Numeric({ minimum: 1 }),
                service_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Application Services"],
                summary: "Link a service to a project application",
            },
        })
        .patch("/:id", updateApplicationService, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                active: t.Boolean(),
            }),
            detail: {
                tags: ["Application Services"],
                summary: "Update application service active status",
            },
        });
}
