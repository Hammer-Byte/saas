import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { filer, logger } from "@hammerbyte/utils";
import { createMedia, deleteMediaById, getMediaById } from "../db/media.js";
import { getGemKeywordTenderById } from "../db/gem_keyword_tenders.js";
import {
    countGemKeywordTenderDocumentsByMediaId,
    createGemKeywordTenderDocument,
    deleteGemKeywordTenderDocumentById,
    getGemKeywordTenderDocumentById,
} from "../db/gem_keyword_tender_documents.js";
import { getCurrentUser } from "./authentication.js";
import { isTerminalStage } from "./gem_keyword_tenders.js";

export function canManageTenderDocuments({ currentUser, tender }) {
    if (!currentUser?.id || !tender) {
        return false;
    }
    if (currentUser.super_admin) {
        return true;
    }
    if (Number(tender.locked) || isTerminalStage(tender.stage)) {
        return false;
    }
    const assigneeUserId = tender.assignee_user_id ? Number(tender.assignee_user_id) : null;
    return assigneeUserId >= 1 && assigneeUserId === Number(currentUser.id);
}

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

async function storeUploadedFile(uploadedFile) {
    const name = String(uploadedFile.name || "file").slice(0, 64);
    const size = Number(uploadedFile.size || 0);
    const type = uploadedFile.type || "unknown";
    const extension = filer.getExtensionByFileName(name);
    const file = extension
        ? `${filer.generateRandomFileName()}.${extension}`
        : filer.generateRandomFileName();
    const diskPath = join(Bun.env.DIRECTORY_MEDIA, file);

    await Bun.write(diskPath, uploadedFile);
    return { name, file, size, type };
}

export async function addGemKeywordTenderDocument({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const tenderId = Number(body?.gem_keyword_tender_id || 0);
    if (!(tenderId >= 1)) {
        set.status = 400;
        return { error: "Tender id is required" };
    }

    const displayName = String(body?.name || "").trim().slice(0, 128);
    if (!displayName) {
        set.status = 400;
        return { error: "Document name is required" };
    }

    const tender = await getGemKeywordTenderById({ id: tenderId });
    if (!tender) {
        set.status = 404;
        return { error: "Tender not found" };
    }

    if (!canManageTenderDocuments({ currentUser, tender })) {
        set.status = 403;
        return { error: "Only the assignee or a super admin can manage tender documents" };
    }

    const uploadedFile = body.file;
    if (!uploadedFile) {
        set.status = 400;
        return { error: "File is required" };
    }

    try {
        const { name, file, size } = await storeUploadedFile(uploadedFile);
        const mediaId = await createMedia({ name, file });
        if (!mediaId) {
            await removeMediaFile(file);
            set.status = 400;
            return { error: "Failed to create media" };
        }

        const id = await createGemKeywordTenderDocument({
            gem_keyword_tender_id: tender.id,
            media_id: mediaId,
            name: displayName,
            created_by: currentUser.id,
        });

        if (!id) {
            await removeMediaFile(file);
            await deleteMediaById({ id: mediaId });
            set.status = 400;
            return { error: "Failed to create tender document" };
        }

        const document = await getGemKeywordTenderDocumentById({ id });
        logger.success(
            `addGemKeywordTenderDocument success | id=${id} tenderId=${tender.id} mediaId=${mediaId} size=${size}`,
        );
        set.status = 201;
        return { message: "Document uploaded", document };
    } catch (error) {
        logger.error(`addGemKeywordTenderDocument failed: ${error?.message || error}`);
        set.status = 500;
        return { error: error?.message || "Failed to upload document" };
    }
}

export async function deleteGemKeywordTenderDocument({ params, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const document = await getGemKeywordTenderDocumentById({ id: params.id });
    if (!document) {
        set.status = 404;
        return { error: "Document not found" };
    }

    const tender = await getGemKeywordTenderById({ id: document.gem_keyword_tender_id });
    if (!tender) {
        set.status = 404;
        return { error: "Tender not found" };
    }

    if (!canManageTenderDocuments({ currentUser, tender })) {
        set.status = 403;
        return { error: "Only the assignee or a super admin can manage tender documents" };
    }

    try {
        const media = await getMediaById({ id: document.media_id });
        await deleteGemKeywordTenderDocumentById({ id: document.id });

        if (media) {
            const remaining = await countGemKeywordTenderDocumentsByMediaId({
                media_id: media.id,
            });
            if (remaining === 0) {
                await removeMediaFile(media.file);
                await deleteMediaById({ id: media.id });
            }
        }

        set.status = 200;
        return { message: "Document deleted" };
    } catch (error) {
        logger.error(`deleteGemKeywordTenderDocument failed: ${error?.message || error}`);
        set.status = 500;
        return { error: error?.message || "Failed to delete document" };
    }
}
