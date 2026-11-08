import { t } from "elysia";
import {
    addTaskReminder,
    deleteTaskReminder,
} from "../../services/task_reminders.js";

export default function (app) {
    return app
        .post("/", addTaskReminder, {
            body: t.Object({
                task_id: t.Numeric({ minimum: 1 }),
                remind_at: t.String({ minLength: 1 }),
                recipient_user_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Task Reminders"],
                summary: "Schedule a task reminder",
            },
        })
        .delete("/:id", deleteTaskReminder, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Task Reminders"],
                summary: "Cancel a pending task reminder",
            },
        });
}
