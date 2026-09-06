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
    createInternalDocument,
    deleteInternalDocumentById,
    getInternalDocumentById,
    updateInternalDocumentById,
} from "../db/internal_documents.js";

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
    const extension = filer.getExtensionByFileName(name);
    const file = extension
        ? `${filer.generateRandomFileName()}.${extension}`
        : filer.generateRandomFileName();

    await Bun.write(join(Bun.env.DIRECTORY_MEDIA, file), uploadedFile);
    return { name, file };
}

export async function addInternalDocument({ body, set }) {
    const uploadedFile = body.file;
    if (!uploadedFile) {
        set.status = 400;
        return { error: "File is required" };
    }

    const { name, file } = await storeUploadedFile(uploadedFile);
    const mediaId = await createMedia({ name, file });
    if (!mediaId) {
        await removeMediaFile(file);
        set.status = 400;
        return { error: "Failed to create media" };
    }

    const id = await createInternalDocument({
        media_id: mediaId,
        description: body.description?.trim() || null,
    });

    if (!id) {
        await removeMediaFile(file);
        await deleteMediaById({ id: mediaId });
        set.status = 400;
        return { error: "Failed to create internal document" };
    }

    const internalDocument = await getInternalDocumentById({ id });
    set.status = 201;
    return { message: "Internal document created", internalDocument };
}

export async function updateInternalDocument({ params, body, set }) {
    const internalDocument = await getInternalDocumentById({ id: params.id });
    if (!internalDocument) {
        set.status = 404;
        return { error: "Internal document not found" };
    }

    const media = await getMediaById({ id: internalDocument.media_id });
    if (!media) {
        set.status = 404;
        return { error: "Media not found" };
    }

    const uploadedFile = body.file;
    if (!uploadedFile) {
        set.status = 400;
        return { error: "File is required" };
    }

    const { name, file } = await storeUploadedFile(uploadedFile);
    await removeMediaFile(media.file);
    await updateMediaById({ id: media.id, name, file });
    await updateInternalDocumentById({
        id: internalDocument.id,
        description: body.description?.trim() || null,
    });

    const updated = await getInternalDocumentById({ id: internalDocument.id });
    set.status = 200;
    return { message: "Internal document updated", internalDocument: updated };
}

export async function deleteInternalDocument({ params, set }) {
    const internalDocument = await getInternalDocumentById({ id: params.id });
    if (!internalDocument) {
        set.status = 404;
        return { error: "Internal document not found" };
    }

    const media = await getMediaById({ id: internalDocument.media_id });

    await deleteInternalDocumentById({ id: internalDocument.id });

    if (media) {
        await removeMediaFile(media.file);
        await deleteMediaById({ id: media.id });
    }

    set.status = 200;
    return { message: "Internal document deleted" };
}
