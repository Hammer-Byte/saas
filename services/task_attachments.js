import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { logger } from "@hammerbyte/utils";
import { deleteMediaById, getMediaById } from "../db/media.js";
import { getTaskById } from "../db/tasks.js";
import {
    createTaskAttachment,
    deleteTaskAttachmentById,
    getTaskAttachmentById,
} from "../db/task_attachments.js";
import { getCurrentUser } from "./authentication.js";
import { logTaskActivity } from "./tasks.js";

async function removeMediaFile(fileName) {
    if (!fileName) {
        return;
    }

    try {
        await unlink(join(Bun.env.DIRECTORY_MEDIA, fileName));
    } catch (error) {
        logger.error(`removeMediaFile unlink: ${error}`);
    }
}

export async function addTaskAttachment({ body, cookie, set }) {
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

    const media = await getMediaById({ id: body.media_id });
    if (!media) {
        set.status = 404;
        return { error: "Media not found" };
    }

    const id = await createTaskAttachment({
        task_id: task.id,
        media_id: media.id,
        description: body.description?.trim() || null,
        created_by_user_id: currentUser.id,
    });

    if (!id) {
        set.status = 400;
        return { error: "Failed to create task attachment" };
    }

    await logTaskActivity({
        task_id: task.id,
        user_id: currentUser.id,
        activity: `Attached file "${media.name || media.file}"`,
    });

    const taskAttachment = await getTaskAttachmentById({ id });

    set.status = 201;
    return { message: "Task attachment created", taskAttachment };
}

export async function deleteTaskAttachment({ params, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const taskAttachment = await getTaskAttachmentById({ id: params.id });
    if (!taskAttachment) {
        set.status = 404;
        return { error: "Task attachment not found" };
    }

    const media = await getMediaById({ id: taskAttachment.media_id });

    await deleteTaskAttachmentById({ id: taskAttachment.id });

    if (media) {
        await removeMediaFile(media.file);
        await deleteMediaById({ id: media.id });
    }

    await logTaskActivity({
        task_id: taskAttachment.task_id,
        user_id: currentUser.id,
        activity: media?.name
            ? `Removed attachment "${media.name}"`
            : "Removed an attachment",
    });

    set.status = 200;
    return { message: "Task attachment deleted" };
}
