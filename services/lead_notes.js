import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { filer, logger } from "@hammerbyte/utils";
import { createMedia, deleteMediaById, getMediaById } from "../db/media.js";
import { getLeadById } from "../db/leads.js";
import {
    createLeadNote,
    deleteLeadNoteById,
    getAllLeadNotesByLeadId,
    getLeadNoteById,
    updateLeadNoteById,
} from "../db/lead_notes.js";
import { requireCrmUser } from "./crm.js";

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

async function deleteNoteMedia(mediaId) {
    if (!(Number(mediaId) >= 1)) return;
    const media = await getMediaById({ id: mediaId });
    if (!media) return;
    await removeMediaFile(media.file);
    await deleteMediaById({ id: media.id });
}

export async function addLeadNote({ body, cookie, set }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const lead = await getLeadById({ id: body.lead_id });
    if (!lead) {
        set.status = 404;
        return { error: "Lead not found" };
    }

    const note = String(body.note || "").trim();
    if (!note) {
        set.status = 400;
        return { error: "Note is required" };
    }

    let mediaId = null;
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
        } catch (error) {
            logger.error(`addLeadNote attachment: ${error}`);
            set.status = 500;
            return { error: "Failed to upload attachment" };
        }
    }

    const noteId = await createLeadNote({
        lead_id: lead.id,
        user_id: access.currentUser.id,
        note,
        media_id: mediaId,
    });

    if (!noteId) {
        await deleteNoteMedia(mediaId);
        set.status = 400;
        return { error: "Failed to add note" };
    }

    const notes = await getAllLeadNotesByLeadId({ lead_id: lead.id });
    const leadNote = notes.find((row) => Number(row.id) === Number(noteId));

    set.status = 201;
    return { message: "Note added", leadNote };
}

export async function updateLeadNote({ params, body, cookie, set }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const existingNote = await getLeadNoteById({ id: params.id });
    if (!existingNote) {
        set.status = 404;
        return { error: "Note not found" };
    }

    if (Number(existingNote.user_id) !== Number(access.currentUser.id)) {
        set.status = 403;
        return { error: "Only the author can edit this note" };
    }

    const note = String(body.note || "").trim();
    if (!note) {
        set.status = 400;
        return { error: "Note is required" };
    }

    await updateLeadNoteById({ id: existingNote.id, note });
    const leadNote = await getLeadNoteById({ id: existingNote.id });
    set.status = 200;
    return { message: "Note updated", leadNote };
}

export async function deleteLeadNote({ params, cookie, set }) {
    const access = await requireCrmUser({ cookie, set });
    if (access.error) {
        return { error: access.error };
    }

    const existingNote = await getLeadNoteById({ id: params.id });
    if (!existingNote) {
        set.status = 404;
        return { error: "Note not found" };
    }

    if (
        Number(existingNote.user_id) !== Number(access.currentUser.id) &&
        !access.currentUser.super_admin
    ) {
        set.status = 403;
        return { error: "Only the author can delete this note" };
    }

    const mediaId = existingNote.media_id;
    await deleteLeadNoteById({ id: existingNote.id });
    await deleteNoteMedia(mediaId);
    set.status = 204;
}
