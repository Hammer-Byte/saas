import { t } from "elysia";
import { addApplication, updateApplication } from "../../services/applications.js";
import {
    addApplicationService,
    updateApplicationService,
} from "../../services/application_services.js";

export default function (app) {
    return app
        .post("/", addApplication, {
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 56,
                    error: "Title is required",
                }),
                active: t.Optional(t.Boolean()),
            }),
            detail: {
                tags: ["Applications"],
                summary: "Create application",
            },
        })
        .patch("/:id", updateApplication, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 56,
                    error: "Title is required",
                }),
                token: t.String({
                    minLength: 1,
                    maxLength: 16,
                    error: "Token is required",
                }),
                active: t.Boolean(),
            }),
            detail: {
                tags: ["Applications"],
                summary: "Update application",
            },
        })
        .post("/:id/services", addApplicationService, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                service_id: t.Numeric({ minimum: 1 }),
                service_configs: t.Optional(t.String()),
            }),
            detail: {
                tags: ["Applications"],
                summary: "Link a service to an application",
            },
        })
        .patch("/:id/application-services/:application_service_id", updateApplicationService, {
            params: t.Object({
                id: t.Numeric(),
                application_service_id: t.Numeric(),
            }),
            body: t.Object({
                active: t.Boolean(),
            }),
            detail: {
                tags: ["Applications"],
                summary: "Update application service active status",
            },
        });
}
