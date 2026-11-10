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
    createInternalDocument,
    deleteInternalDocumentById,
    getInternalDocumentById,
    updateInternalDocumentById,
} from "../db/internal_documents.js";
import { AUTHORITIES } from "../constants.js";
import { hasAuthority } from "../libs/app_page.js";
import { getCurrentUser } from "./authentication.js";

const VISIBILITY_VALUES = new Set(["everyone", "restricted"]);

export function canManageInternalDocuments(currentUser) {
    if (!currentUser?.id) {
        return false;
    }
    if (currentUser.super_admin) {
        return true;
    }
    return hasAuthority(currentUser.authorities, AUTHORITIES.MANAGE_INTERNAL_DOCUMENTS);
}

function normalizeVisibility(value) {
    const visibility = String(value || "restricted").trim().toLowerCase();
    return VISIBILITY_VALUES.has(visibility) ? visibility : null;
}

async function requireManager({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized", currentUser: null };
    }
    if (!canManageInternalDocuments(currentUser)) {
        set.status = 403;
        return {
            error: "Only a super admin or users with manage internal documents authority can do this",
            currentUser,
        };
    }
    return { currentUser };
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

export async function addInternalDocument({ body, cookie, set }) {
    const gate = await requireManager({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    try {
        const uploadedFile = body.file;
        if (!uploadedFile) {
            logger.error("addInternalDocument: missing file in body");
            set.status = 400;
            return { error: "File is required" };
        }

        const visibility = normalizeVisibility(body.visibility);
        if (!visibility) {
            set.status = 400;
            return { error: "Visibility must be everyone or restricted" };
        }

        logger.info(
            `addInternalDocument start | name=${uploadedFile.name} size=${uploadedFile.size} type=${uploadedFile.type}`,
        );

        const { name, file, size } = await storeUploadedFile(uploadedFile);
        const mediaId = await createMedia({ name, file });
        if (!mediaId) {
            logger.error(`addInternalDocument: createMedia failed | name=${name} file=${file}`);
            await removeMediaFile(file);
            set.status = 400;
            return { error: "Failed to create media" };
        }

        logger.info(`addInternalDocument media created | mediaId=${mediaId} file=${file}`);

        const id = await createInternalDocument({
            media_id: mediaId,
            description: body.description?.trim() || null,
            visibility,
        });

        if (!id) {
            logger.error(
                `addInternalDocument: createInternalDocument failed | mediaId=${mediaId} file=${file}`,
            );
            await removeMediaFile(file);
            await deleteMediaById({ id: mediaId });
            set.status = 400;
            return { error: "Failed to create internal document" };
        }

        const internalDocument = await getInternalDocumentById({ id });
        logger.success(
            `addInternalDocument success | id=${id} mediaId=${mediaId} name=${name} size=${size}`,
        );
        set.status = 201;
        return { message: "Internal document created", internalDocument };
    } catch (error) {
        logger.error(`addInternalDocument failed: ${error?.message || error}`);
        if (error?.stack) {
            logger.error(error.stack);
        }
        set.status = 500;
        return { error: error?.message || "Failed to upload document" };
    }
}

export async function updateInternalDocument({ params, body, cookie, set }) {
    const gate = await requireManager({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    try {
        const internalDocument = await getInternalDocumentById({ id: params.id });
        if (!internalDocument) {
            logger.error(`updateInternalDocument: not found id=${params.id}`);
            set.status = 404;
            return { error: "Internal document not found" };
        }

        const visibility = normalizeVisibility(body.visibility);
        if (!visibility) {
            set.status = 400;
            return { error: "Visibility must be everyone or restricted" };
        }

        const uploadedFile =
            body.file && typeof body.file === "object" && Number(body.file.size || 0) > 0
                ? body.file
                : null;

        logger.info(
            `updateInternalDocument start | id=${params.id} replaceFile=${!!uploadedFile}`,
        );

        if (uploadedFile) {
            const media = await getMediaById({ id: internalDocument.media_id });
            if (!media) {
                logger.error(
                    `updateInternalDocument: media missing | documentId=${params.id} mediaId=${internalDocument.media_id}`,
                );
                set.status = 404;
                return { error: "Media not found" };
            }

            const { name, file, size } = await storeUploadedFile(uploadedFile);
            await removeMediaFile(media.file);
            await updateMediaById({ id: media.id, name, file });
            logger.info(
                `updateInternalDocument file replaced | id=${internalDocument.id} mediaId=${media.id} name=${name} size=${size}`,
            );
        }

        await updateInternalDocumentById({
            id: internalDocument.id,
            description: body.description?.trim() || null,
            visibility,
        });

        const updated = await getInternalDocumentById({ id: internalDocument.id });
        logger.success(`updateInternalDocument success | id=${internalDocument.id}`);
        set.status = 200;
        return { message: "Internal document updated", internalDocument: updated };
    } catch (error) {
        logger.error(`updateInternalDocument failed: ${error?.message || error}`);
        if (error?.stack) {
            logger.error(error.stack);
        }
        set.status = 500;
        return { error: error?.message || "Failed to update document" };
    }
}

export async function deleteInternalDocument({ params, cookie, set }) {
    const gate = await requireManager({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    try {
        const internalDocument = await getInternalDocumentById({ id: params.id });
        if (!internalDocument) {
            logger.error(`deleteInternalDocument: not found id=${params.id}`);
            set.status = 404;
            return { error: "Internal document not found" };
        }

        const media = await getMediaById({ id: internalDocument.media_id });

        await deleteInternalDocumentById({ id: internalDocument.id });

        if (media) {
            const remainingInternal = await countInternalDocumentsByMediaId({
                media_id: media.id,
            });
            if (remainingInternal === 0) {
                await removeMediaFile(media.file);
                await deleteMediaById({ id: media.id });
            }
        }

        logger.success(`deleteInternalDocument success | id=${params.id}`);
        set.status = 200;
        return { message: "Internal document deleted" };
    } catch (error) {
        logger.error(`deleteInternalDocument failed: ${error?.message || error}`);
        if (error?.stack) {
            logger.error(error.stack);
        }
        set.status = 500;
        return { error: error?.message || "Failed to delete document" };
    }
}
