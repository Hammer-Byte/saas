import {
    createInquiryNote,
    deleteInquiryNoteById,
    getAllInquiryNotesByInquiryId,
    getInquiryNoteById,
    updateInquiryNoteById,
} from "../db/inquiry_notes.js";
import { getInquiryById } from "../db/inquiries.js";
import { canUserManageInquiry } from "../libs/inquiry_workflow.js";
import { getCurrentUser } from "./authentication.js";
import { logInquiryActivity } from "./inquiries.js";

function notePreview(value) {
    const text = String(value || "")
        .trim()
        .replace(/\s+/g, " ");
    if (!text) return "";
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export async function addInquiryNote({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const inquiry = await getInquiryById({ id: body.inquiry_id });
    if (!inquiry) {
        set.status = 404;
        return { error: "Inquiry not found" };
    }

    if (!canUserManageInquiry({ inquiry, currentUser })) {
        set.status = 403;
        return { error: "Not allowed to add notes on this inquiry" };
    }

    const note = String(body.note || "").trim();
    if (!note) {
        set.status = 400;
        return { error: "Note is required" };
    }

    const noteId = await createInquiryNote({
        inquiry_id: inquiry.id,
        user_id: currentUser.id,
        note,
    });

    if (!noteId) {
        set.status = 400;
        return { error: "Failed to add note" };
    }

    await logInquiryActivity({
        inquiry_id: inquiry.id,
        user_id: currentUser.id,
        activity: `Added note: "${notePreview(note)}"`,
    });

    const notes = await getAllInquiryNotesByInquiryId({ inquiry_id: inquiry.id });
    const inquiryNote = notes.find((row) => Number(row.id) === Number(noteId));

    set.status = 201;
    return { message: "Note added", inquiryNote };
}

export async function updateInquiryNote({ params, body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingNote = await getInquiryNoteById({ id: params.id });
    if (!existingNote) {
        set.status = 404;
        return { error: "Note not found" };
    }

    if (Number(existingNote.user_id) !== Number(currentUser.id)) {
        set.status = 403;
        return { error: "Only the author can edit this note" };
    }

    const note = String(body.note || "").trim();
    if (!note) {
        set.status = 400;
        return { error: "Note is required" };
    }

    await updateInquiryNoteById({
        id: existingNote.id,
        note,
    });

    await logInquiryActivity({
        inquiry_id: existingNote.inquiry_id,
        user_id: currentUser.id,
        activity: `Updated note to: "${notePreview(note)}"`,
    });

    const notes = await getAllInquiryNotesByInquiryId({
        inquiry_id: existingNote.inquiry_id,
    });
    const inquiryNote = notes.find(
        (row) => Number(row.id) === Number(existingNote.id),
    );

    set.status = 200;
    return { message: "Note updated", inquiryNote };
}

export async function deleteInquiryNote({ params, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingNote = await getInquiryNoteById({ id: params.id });
    if (!existingNote) {
        set.status = 404;
        return { error: "Note not found" };
    }

    if (Number(existingNote.user_id) !== Number(currentUser.id)) {
        set.status = 403;
        return { error: "Only the author can delete this note" };
    }

    const preview = notePreview(existingNote.note);
    await deleteInquiryNoteById({ id: existingNote.id });

    await logInquiryActivity({
        inquiry_id: existingNote.inquiry_id,
        user_id: currentUser.id,
        activity: preview ? `Deleted note: "${preview}"` : "Deleted a note",
    });

    set.status = 200;
    return { message: "Note deleted" };
}
