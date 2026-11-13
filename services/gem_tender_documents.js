import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { filer, logger } from "@hammerbyte/utils";
import {
    GEM_TENDER_FILING_MIN_DOCUMENTS,
    GEM_TENDER_LOCK_MESSAGES,
    GEM_TENDER_STAGE_LABELS,
    GEM_TENDER_STAGES,
} from "../constants.js";
import { createMedia, deleteMediaById, getMediaById } from "../db/media.js";
import { getGemTenderById, updateGemTenderById } from "../db/gem_tenders.js";
import {
    countGemTenderDocumentsByMediaId,
    createGemTenderDocument,
    deleteGemTenderDocumentById,
    getGemTenderDocumentById,
} from "../db/gem_tender_documents.js";
import { getCurrentUser } from "./authentication.js";
import {
    canWorkOnEligibleTender,
    knownStageOrNull,
    logActivities,
} from "./gem_tenders.js";

const DOCUMENTS_FORBIDDEN =
    "Only the assignee or a super admin can manage documents, and only on an eligible, unlocked tender";

export function canManageTenderDocuments({ currentUser, tender }) {
    return canWorkOnEligibleTender({ currentUser, tender });
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

/** Stores the file, its media row and the tender document row; cleans up on failure. */
async function saveTenderDocument({ tender, uploadedFile, displayName, userId }) {
    const { name, file, size } = await storeUploadedFile(uploadedFile);
    const mediaId = await createMedia({ name, file });
    if (!mediaId) {
        await removeMediaFile(file);
        return null;
    }

    const id = await createGemTenderDocument({
        gem_tender_id: tender.id,
        media_id: mediaId,
        name: displayName,
        created_by: userId,
    });
    if (!id) {
        await removeMediaFile(file);
        await deleteMediaById({ id: mediaId });
        return null;
    }

    logger.success(
        `saveTenderDocument success | id=${id} tenderId=${tender.id} mediaId=${mediaId} size=${size}`,
    );
    return { id, mediaId, file };
}

async function discardTenderDocument(saved) {
    await deleteGemTenderDocumentById({ id: saved.id });
    await removeMediaFile(saved.file);
    await deleteMediaById({ id: saved.mediaId });
}

export async function addGemTenderDocument({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const tenderId = Number(body?.gem_tender_id || 0);
    if (!(tenderId >= 1)) {
        set.status = 400;
        return { error: "Tender id is required" };
    }

    const displayName = String(body?.name || "").trim().slice(0, 128);
    if (!displayName) {
        set.status = 400;
        return { error: "Document name is required" };
    }

    const tender = await getGemTenderById({ id: tenderId });
    if (!tender) {
        set.status = 404;
        return { error: "Tender not found" };
    }

    if (!canManageTenderDocuments({ currentUser, tender })) {
        set.status = 403;
        return { error: DOCUMENTS_FORBIDDEN };
    }

    const uploadedFile = body.file;
    if (!uploadedFile) {
        set.status = 400;
        return { error: "File is required" };
    }

    try {
        const saved = await saveTenderDocument({
            tender,
            uploadedFile,
            displayName,
            userId: currentUser.id,
        });
        if (!saved) {
            set.status = 400;
            return { error: "Failed to create tender document" };
        }

        const document = await getGemTenderDocumentById({ id: saved.id });
        set.status = 201;
        return { message: "Document uploaded", document };
    } catch (error) {
        logger.error(`addGemTenderDocument failed: ${error?.message || error}`);
        set.status = 500;
        return { error: error?.message || "Failed to upload document" };
    }
}

/**
 * Filed = upload at least GEM_TENDER_FILING_MIN_DOCUMENTS documents, then
 * stage → Filed and lock with "Tender Already Filed".
 */
export async function fileGemTender({ params, body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const tender = await getGemTenderById({ id: params.id });
    if (!tender) {
        set.status = 404;
        return { error: "Tender not found" };
    }

    if (!canWorkOnEligibleTender({ currentUser, tender })) {
        set.status = 403;
        return {
            error: "Only the assignee or a super admin can file an eligible, unlocked tender",
        };
    }

    const previousStage = knownStageOrNull(tender.stage);
    if (previousStage === GEM_TENDER_STAGES.FILED) {
        set.status = 400;
        return { error: "Tender is already filed" };
    }

    const rawFiles = body?.files;
    const files = (Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : []).filter(
        (file) => file && typeof file === "object" && Number(file.size) > 0,
    );
    if (files.length < GEM_TENDER_FILING_MIN_DOCUMENTS) {
        set.status = 400;
        return {
            error: `Upload at least ${GEM_TENDER_FILING_MIN_DOCUMENTS} documents to file this tender`,
        };
    }

    const saved = [];
    try {
        for (const uploadedFile of files) {
            const displayName = String(uploadedFile.name || "Document").trim().slice(0, 128);
            const result = await saveTenderDocument({
                tender,
                uploadedFile,
                displayName,
                userId: currentUser.id,
            });
            if (!result) {
                throw new Error(`Failed to save "${displayName}"`);
            }
            saved.push({ ...result, name: displayName });
        }

        await updateGemTenderById({
            id: tender.id,
            stage: GEM_TENDER_STAGES.FILED,
            filed: true,
            locked: true,
            lock_message: GEM_TENDER_LOCK_MESSAGES.ALREADY_FILED,
            hidden: false,
        });
    } catch (error) {
        logger.error(`fileGemTender failed: ${error?.message || error}`);
        for (const document of saved) {
            await discardTenderDocument(document).catch((cleanupError) => {
                logger.error(`fileGemTender cleanup: ${cleanupError}`);
            });
        }
        set.status = 500;
        return { error: error?.message || "Failed to file tender" };
    }

    const previousLabel = GEM_TENDER_STAGE_LABELS[previousStage] || "No stage";
    await logActivities({
        gem_tender_id: tender.id,
        user_id: currentUser.id,
        activities: [
            `Uploaded ${saved.length} filing documents: ${saved.map((doc) => `"${doc.name}"`).join(", ")}`,
            `Changed stage from ${previousLabel} to ${GEM_TENDER_STAGE_LABELS[GEM_TENDER_STAGES.FILED]}`,
            `Locked tender: ${GEM_TENDER_LOCK_MESSAGES.ALREADY_FILED}`,
        ],
    });

    set.status = 200;
    return {
        message: "Tender filed",
        gemTender: await getGemTenderById({ id: tender.id }),
    };
}

export async function deleteGemTenderDocument({ params, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const document = await getGemTenderDocumentById({ id: params.id });
    if (!document) {
        set.status = 404;
        return { error: "Document not found" };
    }

    const tender = await getGemTenderById({ id: document.gem_tender_id });
    if (!tender) {
        set.status = 404;
        return { error: "Tender not found" };
    }

    if (!canManageTenderDocuments({ currentUser, tender })) {
        set.status = 403;
        return { error: DOCUMENTS_FORBIDDEN };
    }

    try {
        const media = await getMediaById({ id: document.media_id });
        await deleteGemTenderDocumentById({ id: document.id });

        if (media) {
            const remaining = await countGemTenderDocumentsByMediaId({
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
        logger.error(`deleteGemTenderDocument failed: ${error?.message || error}`);
        set.status = 500;
        return { error: error?.message || "Failed to delete document" };
    }
}
