import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { filer, logger } from "@hammerbyte/utils";
import {
    createGemKeywordTenderComment,
    deleteGemKeywordTenderCommentById,
    getAllGemKeywordTenderCommentsByTenderId,
    getGemKeywordTenderCommentById,
    updateGemKeywordTenderCommentById,
} from "../db/gem_keyword_tender_comments.js";
import { createMedia, deleteMediaById, getMediaById } from "../db/media.js";
import { getGemKeywordTenderById } from "../db/gem_keyword_tenders.js";
import { getCurrentUser } from "./authentication.js";
import { logGemKeywordTenderActivity } from "./gem_keyword_tenders.js";

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

export async function addGemKeywordTenderComment({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const gemKeywordTender = await getGemKeywordTenderById({
        id: body.gem_keyword_tender_id,
    });
    if (!gemKeywordTender) {
        set.status = 404;
        return { error: "Tender not found" };
    }

    const lockedStage = ["unattended", "missed"].includes(String(gemKeywordTender.stage || ""));
    if (lockedStage && !currentUser.super_admin) {
        set.status = 403;
        return { error: "Only a super admin can comment on Unattended or Missed tenders" };
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
            logger.error(`addGemKeywordTenderComment attachment: ${error}`);
            set.status = 500;
            return { error: "Failed to upload attachment" };
        }
    }

    const commentId = await createGemKeywordTenderComment({
        gem_keyword_tender_id: gemKeywordTender.id,
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
    await logGemKeywordTenderActivity({
        gem_keyword_tender_id: gemKeywordTender.id,
        user_id: currentUser.id,
        activity: activityParts.join(" "),
    });

    const comments = await getAllGemKeywordTenderCommentsByTenderId({
        gem_keyword_tender_id: gemKeywordTender.id,
    });
    const gemKeywordTenderComment = comments.find(
        (row) => Number(row.id) === Number(commentId),
    );

    set.status = 201;
    return {
        message: "Comment added",
        gemKeywordTenderComment,
    };
}

export async function updateGemKeywordTenderComment({ params, body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingComment = await getGemKeywordTenderCommentById({ id: params.id });
    if (!existingComment) {
        set.status = 404;
        return { error: "Comment not found" };
    }

    const tender = await getGemKeywordTenderById({
        id: existingComment.gem_keyword_tender_id,
    });
    if (
        tender &&
        ["unattended", "missed"].includes(String(tender.stage || "")) &&
        !currentUser.super_admin
    ) {
        set.status = 403;
        return { error: "Only a super admin can edit comments on Unattended or Missed tenders" };
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

    await updateGemKeywordTenderCommentById({
        id: existingComment.id,
        comment,
    });

    await logGemKeywordTenderActivity({
        gem_keyword_tender_id: existingComment.gem_keyword_tender_id,
        user_id: currentUser.id,
        activity: `Updated comment to: "${commentPreview(comment)}"`,
    });

    const comments = await getAllGemKeywordTenderCommentsByTenderId({
        gem_keyword_tender_id: existingComment.gem_keyword_tender_id,
    });
    const gemKeywordTenderComment = comments.find(
        (row) => Number(row.id) === Number(existingComment.id),
    );

    set.status = 200;
    return {
        message: "Comment updated",
        gemKeywordTenderComment,
    };
}

export async function deleteGemKeywordTenderComment({ params, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingComment = await getGemKeywordTenderCommentById({ id: params.id });
    if (!existingComment) {
        set.status = 404;
        return { error: "Comment not found" };
    }

    const tender = await getGemKeywordTenderById({
        id: existingComment.gem_keyword_tender_id,
    });
    if (
        tender &&
        ["unattended", "missed"].includes(String(tender.stage || "")) &&
        !currentUser.super_admin
    ) {
        set.status = 403;
        return { error: "Only a super admin can delete comments on Unattended or Missed tenders" };
    }

    if (Number(existingComment.user_id) !== Number(currentUser.id)) {
        set.status = 403;
        return { error: "Only the author can delete this comment" };
    }

    const preview = commentPreview(existingComment.comment);
    const mediaId = existingComment.media_id;
    await deleteGemKeywordTenderCommentById({ id: existingComment.id });
    await deleteCommentMedia(mediaId);

    await logGemKeywordTenderActivity({
        gem_keyword_tender_id: existingComment.gem_keyword_tender_id,
        user_id: currentUser.id,
        activity: preview ? `Deleted comment: "${preview}"` : "Deleted a comment",
    });

    set.status = 200;
    return { message: "Comment deleted" };
}
