import { t } from "elysia";
import {
    addProjectApplication,
    updateProjectApplication,
} from "../../services/project_applications.js";

export default function (app) {
    return app
        .post("/", addProjectApplication, {
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 56,
                    error: "Title is required",
                }),
                active: t.Optional(t.Boolean()),
                project_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Project Applications"],
                summary: "Create project application",
            },
        })
        .patch("/:id", updateProjectApplication, {
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
                project_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Project Applications"],
                summary: "Update project application",
            },
        });
}
