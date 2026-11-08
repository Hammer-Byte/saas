import { t } from "elysia";
import {
    addTaskComment,
    deleteTaskComment,
    updateTaskComment,
} from "../../services/task_comments.js";

export default function (app) {
    return app
        .post("/", addTaskComment, {
            body: t.Object({
                task_id: t.Numeric({ minimum: 1 }),
                comment: t.String({ minLength: 1 }),
                file: t.Optional(t.File()),
            }),
            detail: {
                tags: ["Task Comments"],
                summary: "Add a task comment (optional attachment)",
            },
        })
        .patch("/:id", updateTaskComment, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                comment: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["Task Comments"],
                summary: "Update a task comment",
            },
        })
        .delete("/:id", deleteTaskComment, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Task Comments"],
                summary: "Delete a task comment",
            },
        });
}
