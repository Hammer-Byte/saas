import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { filer, logger } from "@hammerbyte/utils";
import {
    createMedia,
    deleteMediaById,
    getMediaById,
    updateMediaById,
} from "../db/media.js";
import {
    countInternalDocumentsByMediaId,
    getInternalDocumentById,
} from "../db/internal_documents.js";
import {
    countGemMandatoryDocumentsByMediaId,
    createGemMandatoryDocument,
    deleteGemMandatoryDocumentById,
    getGemMandatoryDocumentById,
    getGemMandatoryDocumentByMediaId,
    updateGemMandatoryDocumentById,
} from "../db/gem_mandatory_documents.js";
import { getCurrentUser } from "./authentication.js";

async function requireSuperAdmin({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return null;
    }
    if (!currentUser.super_admin) {
        set.status = 403;
        return null;
    }
    return currentUser;
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

    logger.info(
        `storeUploadedFile start | name=${name} type=${type} size=${size} bytes | disk=${diskPath}`,
    );

    await Bun.write(diskPath, uploadedFile);

    logger.info(`storeUploadedFile done | name=${name} disk=${file} size=${size} bytes`);
    return { name, file, size, type };
}

async function mediaStillReferenced({ media_id }) {
    const internalCount = await countInternalDocumentsByMediaId({ media_id });
    const mandatoryCount = await countGemMandatoryDocumentsByMediaId({ media_id });
    return internalCount + mandatoryCount > 0;
}

export async function addGemMandatoryDocument({ body, cookie, set }) {
    if (!(await requireSuperAdmin({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Super admin required" };
    }

    try {
        const uploadedFile = body.file;
        if (!uploadedFile) {
            set.status = 400;
            return { error: "File is required" };
        }

        const { name, file, size } = await storeUploadedFile(uploadedFile);
        const mediaId = await createMedia({ name, file });
        if (!mediaId) {
            await removeMediaFile(file);
            set.status = 400;
            return { error: "Failed to create media" };
        }

        const id = await createGemMandatoryDocument({
            media_id: mediaId,
            description: body.description?.trim() || null,
        });

        if (!id) {
            await removeMediaFile(file);
            await deleteMediaById({ id: mediaId });
            set.status = 400;
            return { error: "Failed to create mandatory document" };
        }

        const document = await getGemMandatoryDocumentById({ id });
        logger.success(
            `addGemMandatoryDocument success | id=${id} mediaId=${mediaId} name=${name} size=${size}`,
        );
        set.status = 201;
        return { message: "Mandatory document created", document };
    } catch (error) {
        logger.error(`addGemMandatoryDocument failed: ${error?.message || error}`);
        set.status = 500;
        return { error: error?.message || "Failed to upload document" };
    }
}

export async function updateGemMandatoryDocument({ params, body, cookie, set }) {
    if (!(await requireSuperAdmin({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Super admin required" };
    }

    try {
        const document = await getGemMandatoryDocumentById({ id: params.id });
        if (!document) {
            set.status = 404;
            return { error: "Mandatory document not found" };
        }

        const media = await getMediaById({ id: document.media_id });
        if (!media) {
            set.status = 404;
            return { error: "Media not found" };
        }

        const uploadedFile = body.file;
        if (!uploadedFile) {
            set.status = 400;
            return { error: "File is required" };
        }

        const { name, file, size } = await storeUploadedFile(uploadedFile);
        await removeMediaFile(media.file);
        await updateMediaById({ id: media.id, name, file });
        await updateGemMandatoryDocumentById({
            id: document.id,
            description: body.description?.trim() || null,
        });

        const updated = await getGemMandatoryDocumentById({ id: document.id });
        logger.success(
            `updateGemMandatoryDocument success | id=${document.id} mediaId=${media.id} name=${name} size=${size}`,
        );
        set.status = 200;
        return { message: "Mandatory document updated", document: updated };
    } catch (error) {
        logger.error(`updateGemMandatoryDocument failed: ${error?.message || error}`);
        set.status = 500;
        return { error: error?.message || "Failed to update document" };
    }
}

export async function deleteGemMandatoryDocument({ params, cookie, set }) {
    if (!(await requireSuperAdmin({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Super admin required" };
    }

    try {
        const document = await getGemMandatoryDocumentById({ id: params.id });
        if (!document) {
            set.status = 404;
            return { error: "Mandatory document not found" };
        }

        const media = await getMediaById({ id: document.media_id });
        await deleteGemMandatoryDocumentById({ id: document.id });

        if (media && !(await mediaStillReferenced({ media_id: media.id }))) {
            await removeMediaFile(media.file);
            await deleteMediaById({ id: media.id });
        }

        set.status = 200;
        return { message: "Mandatory document deleted" };
    } catch (error) {
        logger.error(`deleteGemMandatoryDocument failed: ${error?.message || error}`);
        set.status = 500;
        return { error: error?.message || "Failed to delete document" };
    }
}

export async function copyInternalDocumentToGemMandatory({ body, cookie, set }) {
    if (!(await requireSuperAdmin({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Super admin required" };
    }

    const internalDocumentId = Number(body?.internal_document_id || 0);
    if (!(internalDocumentId >= 1)) {
        set.status = 400;
        return { error: "Internal document id is required" };
    }

    const internalDocument = await getInternalDocumentById({ id: internalDocumentId });
    if (!internalDocument) {
        set.status = 404;
        return { error: "Internal document not found" };
    }

    const existing = await getGemMandatoryDocumentByMediaId({
        media_id: internalDocument.media_id,
    });
    if (existing) {
        set.status = 200;
        return {
            message: "Document already in GEM Mandatory Documents",
            alreadyCopied: true,
            document: existing,
        };
    }

    const id = await createGemMandatoryDocument({
        media_id: internalDocument.media_id,
        description: internalDocument.description || null,
    });
    if (!id) {
        set.status = 400;
        return { error: "Failed to copy document" };
    }

    const document = await getGemMandatoryDocumentById({ id });
    set.status = 201;
    return {
        message: "Copied to GEM Mandatory Documents",
        alreadyCopied: false,
        document,
    };
}
