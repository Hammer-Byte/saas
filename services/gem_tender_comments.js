import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { filer, logger } from "@hammerbyte/utils";
import {
    createGemTenderComment,
    deleteGemTenderCommentById,
    getAllGemTenderCommentsByTenderId,
    getGemTenderCommentById,
    updateGemTenderCommentById,
} from "../db/gem_tender_comments.js";
import { createMedia, deleteMediaById, getMediaById } from "../db/media.js";
import { getGemTenderById } from "../db/gem_tenders.js";
import { getCurrentUser } from "./authentication.js";
import {
    canOperateAssignedTender,
    logGemTenderActivity,
} from "./gem_tenders.js";

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

export async function addGemTenderComment({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const gemTender = await getGemTenderById({
        id: body.gem_tender_id,
    });
    if (!gemTender) {
        set.status = 404;
        return { error: "Tender not found" };
    }

    const tenderLocked = !!Number(gemTender.locked);
    if (tenderLocked) {
        set.status = 403;
        return { error: "Unlock this tender before commenting" };
    }
    if (
        !canOperateAssignedTender({
            currentUser,
            assigneeUserId: gemTender.assignee_user_id,
            stage: gemTender.stage,
            locked: tenderLocked,
        })
    ) {
        set.status = 403;
        return {
            error: "Only the assignee or a super admin can comment on this tender",
        };
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
            logger.error(`addGemTenderComment attachment: ${error}`);
            set.status = 500;
            return { error: "Failed to upload attachment" };
        }
    }

    const commentId = await createGemTenderComment({
        gem_tender_id: gemTender.id,
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
    await logGemTenderActivity({
        gem_tender_id: gemTender.id,
        user_id: currentUser.id,
        activity: activityParts.join(" "),
    });

    const comments = await getAllGemTenderCommentsByTenderId({
        gem_tender_id: gemTender.id,
    });
    const gemTenderComment = comments.find(
        (row) => Number(row.id) === Number(commentId),
    );

    set.status = 201;
    return {
        message: "Comment added",
        gemTenderComment,
    };
}

export async function updateGemTenderComment({ params, body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingComment = await getGemTenderCommentById({ id: params.id });
    if (!existingComment) {
        set.status = 404;
        return { error: "Comment not found" };
    }

    const tender = await getGemTenderById({
        id: existingComment.gem_tender_id,
    });
    if (tender && Number(tender.locked)) {
        set.status = 403;
        return { error: "Unlock this tender before editing comments" };
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

    await updateGemTenderCommentById({
        id: existingComment.id,
        comment,
    });

    await logGemTenderActivity({
        gem_tender_id: existingComment.gem_tender_id,
        user_id: currentUser.id,
        activity: `Updated comment to: "${commentPreview(comment)}"`,
    });

    const comments = await getAllGemTenderCommentsByTenderId({
        gem_tender_id: existingComment.gem_tender_id,
    });
    const gemTenderComment = comments.find(
        (row) => Number(row.id) === Number(existingComment.id),
    );

    set.status = 200;
    return {
        message: "Comment updated",
        gemTenderComment,
    };
}

export async function deleteGemTenderComment({ params, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingComment = await getGemTenderCommentById({ id: params.id });
    if (!existingComment) {
        set.status = 404;
        return { error: "Comment not found" };
    }

    const tender = await getGemTenderById({
        id: existingComment.gem_tender_id,
    });
    if (tender && Number(tender.locked)) {
        set.status = 403;
        return { error: "Unlock this tender before deleting comments" };
    }

    if (Number(existingComment.user_id) !== Number(currentUser.id)) {
        set.status = 403;
        return { error: "Only the author can delete this comment" };
    }

    const preview = commentPreview(existingComment.comment);
    const mediaId = existingComment.media_id;
    await deleteGemTenderCommentById({ id: existingComment.id });
    await deleteCommentMedia(mediaId);

    await logGemTenderActivity({
        gem_tender_id: existingComment.gem_tender_id,
        user_id: currentUser.id,
        activity: preview ? `Deleted comment: "${preview}"` : "Deleted a comment",
    });

    set.status = 200;
    return { message: "Comment deleted" };
}
