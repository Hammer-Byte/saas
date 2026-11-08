import { t } from "elysia";
import {
    addTaskAttachment,
    deleteTaskAttachment,
} from "../../services/task_attachments.js";

export default function (app) {
    return app
        .post("/", addTaskAttachment, {
            body: t.Object({
                task_id: t.Numeric({ minimum: 1 }),
                media_id: t.Numeric({ minimum: 1 }),
                description: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["Task Attachments"],
                summary: "Link a media file to a task",
            },
        })
        .delete("/:id", deleteTaskAttachment, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Task Attachments"],
                summary: "Delete a task attachment",
            },
        });
}
