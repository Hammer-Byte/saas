import {
    createGemKeywordTenderComment,
    deleteGemKeywordTenderCommentById,
    getAllGemKeywordTenderCommentsByTenderId,
    getGemKeywordTenderCommentById,
    updateGemKeywordTenderCommentById,
} from "../db/gem_keyword_tender_comments.js";
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

    const comment = String(body.comment || "").trim();
    if (!comment) {
        set.status = 400;
        return { error: "Comment is required" };
    }

    const commentId = await createGemKeywordTenderComment({
        gem_keyword_tender_id: gemKeywordTender.id,
        user_id: currentUser.id,
        comment,
    });

    await logGemKeywordTenderActivity({
        gem_keyword_tender_id: gemKeywordTender.id,
        user_id: currentUser.id,
        activity: `Added comment: "${commentPreview(comment)}"`,
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

    if (Number(existingComment.user_id) !== Number(currentUser.id)) {
        set.status = 403;
        return { error: "Only the author can delete this comment" };
    }

    const preview = commentPreview(existingComment.comment);
    await deleteGemKeywordTenderCommentById({ id: existingComment.id });

    await logGemKeywordTenderActivity({
        gem_keyword_tender_id: existingComment.gem_keyword_tender_id,
        user_id: currentUser.id,
        activity: preview ? `Deleted comment: "${preview}"` : "Deleted a comment",
    });

    set.status = 200;
    return { message: "Comment deleted" };
}
