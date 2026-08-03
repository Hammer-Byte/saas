import { t } from "elysia";
import {
    addProjectTag,
    deleteProjectTag,
    updateProjectTag,
} from "../../services/project_tags.js";

export default function (app) {
    return app
        .post("/", addProjectTag, {
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 56,
                    error: "Title is required",
                }),
            }),
            detail: {
                tags: ["Project Tags"],
                summary: "Create project tag",
            },
        })
        .patch("/", updateProjectTag, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                title: t.String({
                    minLength: 1,
                    maxLength: 56,
                    error: "Title is required",
                }),
            }),
            detail: {
                tags: ["Project Tags"],
                summary: "Update project tag",
            },
        })
        .delete("/:id", deleteProjectTag, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Project Tags"],
                summary: "Delete project tag",
            },
        });
}
