import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { filer, logger } from "@hammerbyte/utils";
import { createMedia, deleteMediaById, getMediaById } from "../db/media.js";
import { getTaskById } from "../db/tasks.js";
import {
    createTaskComment,
    deleteTaskCommentById,
    getAllTaskCommentsByTaskId,
    getTaskCommentById,
    updateTaskCommentById,
} from "../db/task_comments.js";
import { getCurrentUser } from "./authentication.js";
import { logTaskActivity } from "./tasks.js";

function commentPreview(value) {
    const text = String(value || "")
        .trim()
        .replace(/\s+/g, " ");
    if (!text) return "";
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

async function removeMediaFile(fileName) {
    if (!fileName) return;
    try {
        await unlink(join(Bun.env.DIRECTORY_MEDIA, fileName));
    } catch (error) {
        logger.error(`removeMediaFile unlink: ${error}`);
    }
}

async function storeUploadedFile(uploadedFile) {
    const name = String(uploadedFile.name || "file").slice(0, 64);
    const extension = filer.getExtensionByFileName(name);
    const file = extension
        ? `${filer.generateRandomFileName()}.${extension}`
        : filer.generateRandomFileName();
    await Bun.write(join(Bun.env.DIRECTORY_MEDIA, file), uploadedFile);
    return { name, file };
}

async function deleteCommentMedia(mediaId) {
    if (!(Number(mediaId) >= 1)) return;
    const media = await getMediaById({ id: mediaId });
    if (!media) return;
    await removeMediaFile(media.file);
    await deleteMediaById({ id: media.id });
}

export async function addTaskComment({ body, cookie, set }) {
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

    const comment = String(body.comment || "").trim();
    if (!comment) {
        set.status = 400;
        return { error: "Comment is required" };
    }

    let mediaId = null;
    let attachmentName = null;
    const uploadedFile = body.file;
    if (uploadedFile && typeof uploadedFile === "object" && uploadedFile.size > 0) {
        try {
            const stored = await storeUploadedFile(uploadedFile);
            mediaId = await createMedia({ name: stored.name, file: stored.file });
            if (!mediaId) {
                await removeMediaFile(stored.file);
                set.status = 400;
                return { error: "Failed to store attachment" };
            }
            attachmentName = stored.name;
        } catch (error) {
            logger.error(`addTaskComment attachment: ${error}`);
            set.status = 500;
            return { error: "Failed to upload attachment" };
        }
    }

    const commentId = await createTaskComment({
        task_id: task.id,
        user_id: currentUser.id,
        comment,
        media_id: mediaId,
    });

    if (!commentId) {
        await deleteCommentMedia(mediaId);
        set.status = 400;
        return { error: "Failed to add comment" };
    }

    const activityParts = [`Added comment: "${commentPreview(comment)}"`];
    if (attachmentName) {
        activityParts.push(`with attachment "${attachmentName}"`);
    }
    await logTaskActivity({
        task_id: task.id,
        user_id: currentUser.id,
        activity: activityParts.join(" "),
    });

    const comments = await getAllTaskCommentsByTaskId({ task_id: task.id });
    const taskComment = comments.find((row) => Number(row.id) === Number(commentId));

    set.status = 201;
    return {
        message: "Comment added",
        taskComment,
    };
}

export async function updateTaskComment({ params, body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingComment = await getTaskCommentById({ id: params.id });
    if (!existingComment) {
        set.status = 404;
        return { error: "Comment not found" };
    }

    if (Number(existingComment.user_id) !== Number(currentUser.id)) {
        set.status = 403;
        return { error: "Only the author can edit this comment" };
    }

    const comment = String(body.comment || "").trim();
    if (!comment) {
        set.status = 400;
        return { error: "Comment is required" };
    }

    await updateTaskCommentById({
        id: existingComment.id,
        comment,
    });

    await logTaskActivity({
        task_id: existingComment.task_id,
        user_id: currentUser.id,
        activity: `Updated comment to: "${commentPreview(comment)}"`,
    });

    const comments = await getAllTaskCommentsByTaskId({
        task_id: existingComment.task_id,
    });
    const taskComment = comments.find(
        (row) => Number(row.id) === Number(existingComment.id),
    );

    set.status = 200;
    return {
        message: "Comment updated",
        taskComment,
    };
}

export async function deleteTaskComment({ params, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingComment = await getTaskCommentById({ id: params.id });
    if (!existingComment) {
        set.status = 404;
        return { error: "Comment not found" };
    }

    if (Number(existingComment.user_id) !== Number(currentUser.id)) {
        set.status = 403;
        return { error: "Only the author can delete this comment" };
    }

    const preview = commentPreview(existingComment.comment);
    const mediaId = existingComment.media_id;
    await deleteTaskCommentById({ id: existingComment.id });
    await deleteCommentMedia(mediaId);

    await logTaskActivity({
        task_id: existingComment.task_id,
        user_id: currentUser.id,
        activity: preview ? `Deleted comment: "${preview}"` : "Deleted a comment",
    });

    set.status = 200;
    return { message: "Comment deleted" };
}
