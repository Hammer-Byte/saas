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
    countGemDocumentsByMediaId,
    createGemDocument,
    deleteGemDocumentById,
    getAllGemDocuments,
    getGemDocumentById,
    updateGemDocumentById,
} from "../db/gem_documents.js";
import { AUTHORITIES } from "../constants.js";
import { hasAuthority } from "../libs/app_page.js";
import { getCurrentUser } from "./authentication.js";

export function canUseGemSection(currentUser) {
    if (!currentUser?.id) {
        return false;
    }
    if (currentUser.super_admin) {
        return true;
    }
    return (
        hasAuthority(currentUser.authorities, AUTHORITIES.USE_PAGE_GEM_TENDERS) ||
        hasAuthority(currentUser.authorities, AUTHORITIES.USE_PAGE_GEM_CATEGORIES)
    );
}

export function canManageGemDocuments(currentUser) {
    if (!currentUser?.id) {
        return false;
    }
    if (currentUser.super_admin) {
        return true;
    }
    return hasAuthority(currentUser.authorities, AUTHORITIES.MANAGE_GEM_DOCUMENTS);
}

async function requireGemSectionUser({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized", currentUser: null };
    }
    if (!canUseGemSection(currentUser)) {
        set.status = 403;
        return {
            error: "You do not have access to GEM documents",
            currentUser,
        };
    }
    return { currentUser };
}

async function requireManager({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized", currentUser: null };
    }
    if (!canManageGemDocuments(currentUser)) {
        set.status = 403;
        return {
            error: "Only a super admin or users with manage GEM documents authority can do this",
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

export async function listGemDocuments({ cookie, set }) {
    const gate = await requireGemSectionUser({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    const documents = await getAllGemDocuments();
    set.status = 200;
    return { documents };
}

export async function getGemDocument({ params, cookie, set }) {
    const gate = await requireGemSectionUser({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    const document = await getGemDocumentById({ id: params.id });
    if (!document) {
        set.status = 404;
        return { error: "GEM document not found" };
    }

    set.status = 200;
    return { document };
}

export async function addGemDocument({ body, cookie, set }) {
    const gate = await requireManager({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    try {
        const uploadedFile = body.file;
        if (!uploadedFile) {
            logger.error("addGemDocument: missing file in body");
            set.status = 400;
            return { error: "File is required" };
        }

        logger.info(
            `addGemDocument start | name=${uploadedFile.name} size=${uploadedFile.size} type=${uploadedFile.type}`,
        );

        const { name, file, size } = await storeUploadedFile(uploadedFile);
        const mediaId = await createMedia({ name, file });
        if (!mediaId) {
            logger.error(`addGemDocument: createMedia failed | name=${name} file=${file}`);
            await removeMediaFile(file);
            set.status = 400;
            return { error: "Failed to create media" };
        }

        logger.info(`addGemDocument media created | mediaId=${mediaId} file=${file}`);

        const id = await createGemDocument({
            media_id: mediaId,
            description: body.description?.trim() || null,
            created_by: gate.currentUser.id,
        });

        if (!id) {
            logger.error(
                `addGemDocument: createGemDocument failed | mediaId=${mediaId} file=${file}`,
            );
            await removeMediaFile(file);
            await deleteMediaById({ id: mediaId });
            set.status = 400;
            return { error: "Failed to create GEM document" };
        }

        const document = await getGemDocumentById({ id });
        logger.success(
            `addGemDocument success | id=${id} mediaId=${mediaId} name=${name} size=${size}`,
        );
        set.status = 201;
        return { message: "GEM document created", document };
    } catch (error) {
        logger.error(`addGemDocument failed: ${error?.message || error}`);
        if (error?.stack) {
            logger.error(error.stack);
        }
        set.status = 500;
        return { error: error?.message || "Failed to upload document" };
    }
}

export async function updateGemDocument({ params, body, cookie, set }) {
    const gate = await requireManager({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    try {
        const document = await getGemDocumentById({ id: params.id });
        if (!document) {
            logger.error(`updateGemDocument: not found id=${params.id}`);
            set.status = 404;
            return { error: "GEM document not found" };
        }

        const uploadedFile =
            body.file && typeof body.file === "object" && Number(body.file.size || 0) > 0
                ? body.file
                : null;

        logger.info(
            `updateGemDocument start | id=${params.id} replaceFile=${!!uploadedFile}`,
        );

        if (uploadedFile) {
            const media = await getMediaById({ id: document.media_id });
            if (!media) {
                logger.error(
                    `updateGemDocument: media missing | documentId=${params.id} mediaId=${document.media_id}`,
                );
                set.status = 404;
                return { error: "Media not found" };
            }

            const { name, file, size } = await storeUploadedFile(uploadedFile);
            await removeMediaFile(media.file);
            await updateMediaById({ id: media.id, name, file });
            logger.info(
                `updateGemDocument file replaced | id=${document.id} mediaId=${media.id} name=${name} size=${size}`,
            );
        }

        await updateGemDocumentById({
            id: document.id,
            description: body.description?.trim() || null,
        });

        const updated = await getGemDocumentById({ id: document.id });
        logger.success(`updateGemDocument success | id=${document.id}`);
        set.status = 200;
        return { message: "GEM document updated", document: updated };
    } catch (error) {
        logger.error(`updateGemDocument failed: ${error?.message || error}`);
        if (error?.stack) {
            logger.error(error.stack);
        }
        set.status = 500;
        return { error: error?.message || "Failed to update document" };
    }
}

export async function deleteGemDocument({ params, cookie, set }) {
    const gate = await requireManager({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    try {
        const document = await getGemDocumentById({ id: params.id });
        if (!document) {
            logger.error(`deleteGemDocument: not found id=${params.id}`);
            set.status = 404;
            return { error: "GEM document not found" };
        }

        const media = await getMediaById({ id: document.media_id });

        await deleteGemDocumentById({ id: document.id });

        if (media) {
            const remaining = await countGemDocumentsByMediaId({
                media_id: media.id,
            });
            if (remaining === 0) {
                await removeMediaFile(media.file);
                await deleteMediaById({ id: media.id });
            }
        }

        logger.success(`deleteGemDocument success | id=${params.id}`);
        set.status = 200;
        return { message: "GEM document deleted" };
    } catch (error) {
        logger.error(`deleteGemDocument failed: ${error?.message || error}`);
        if (error?.stack) {
            logger.error(error.stack);
        }
        set.status = 500;
        return { error: error?.message || "Failed to delete document" };
    }
}
