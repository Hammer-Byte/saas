import { t } from "elysia";
import { addProject, deleteProject, updateProject } from "../../services/projects.js";

export default function (app) {
    return app
        .post("/", addProject, {
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 56,
                    error: "Title is required",
                }),
                description: t.Optional(
                    t.Union([t.String({ maxLength: 512 }), t.Literal(""), t.Null()]),
                ),
            }),
            detail: {
                tags: ["Projects"],
                summary: "Create project",
            },
        })
        .patch("/", updateProject, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                title: t.String({
                    minLength: 1,
                    maxLength: 56,
                    error: "Title is required",
                }),
                description: t.Optional(
                    t.Union([t.String({ maxLength: 512 }), t.Literal(""), t.Null()]),
                ),
            }),
            detail: {
                tags: ["Projects"],
                summary: "Update project",
            },
        })
        .delete("/:id", deleteProject, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Projects"],
                summary: "Delete project",
            },
        });
}
