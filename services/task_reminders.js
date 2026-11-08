import { getTaskById } from "../db/tasks.js";
import {
    createTaskReminder,
    deleteTaskReminderById,
    getTaskReminderById,
} from "../db/task_reminders.js";
import { getUserById } from "../db/users.js";
import { toDbDateTime } from "../libs/date.js";
import { getCurrentUser } from "./authentication.js";
import { logTaskActivity } from "./tasks.js";

export async function addTaskReminder({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const task = await getTaskById({ id: body.task_id });
    if (!task) {
        set.status = 404;
        return { error: "Task not found" };
    }

    const recipientUserId = body.recipient_user_id;
    const recipientUser = await getUserById({ id: recipientUserId });
    if (!recipientUser) {
        set.status = 400;
        return { error: "Recipient not found" };
    }

    const remindAt = toDbDateTime(body.remind_at);
    if (!remindAt) {
        set.status = 400;
        return { error: "Invalid remind_at" };
    }

    const reminderId = await createTaskReminder({
        task_id: task.id,
        remind_at: remindAt,
        recipient_user_id: recipientUser.id,
        created_by_user_id: currentUser.id,
    });

    if (!reminderId) {
        set.status = 400;
        return { error: "Failed to create reminder" };
    }

    await logTaskActivity({
        task_id: task.id,
        user_id: currentUser.id,
        activity: `Scheduled reminder for ${recipientUser.full_name || recipientUser.email} at ${remindAt}`,
    });

    const taskReminder = await getTaskReminderById({ id: reminderId });

    set.status = 201;
    return { message: "Task reminder created", taskReminder };
}

export async function deleteTaskReminder({ params, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingReminder = await getTaskReminderById({ id: params.id });
    if (!existingReminder) {
        set.status = 404;
        return { error: "Reminder not found" };
    }

    if (existingReminder.sent_on) {
        set.status = 400;
        return { error: "Cannot delete a reminder that was already sent" };
    }

    await deleteTaskReminderById({ id: existingReminder.id });

    await logTaskActivity({
        task_id: existingReminder.task_id,
        user_id: currentUser.id,
        activity: "Cancelled a pending reminder",
    });

    set.status = 200;
    return { message: "Task reminder deleted" };
}
