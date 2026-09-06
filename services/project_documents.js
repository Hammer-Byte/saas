import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { filer, logger } from "@hammerbyte/utils";
import { getCustomerProjectById } from "../db/customer_projects.js";
import {
    deleteMediaById,
    getMediaById,
    updateMediaById,
} from "../db/media.js";
import {
    createProjectDocument,
    deleteProjectDocumentById,
    getProjectDocumentById,
    updateProjectDocumentById,
} from "../db/project_documents.js";

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

export async function addProjectDocument({ body, set }) {
    const customerProject = await getCustomerProjectById({ id: body.project_id });
    if (!customerProject) {
        set.status = 404;
        return { error: "Customer project not found" };
    }

    const media = await getMediaById({ id: body.media_id });
    if (!media) {
        set.status = 404;
        return { error: "Media not found" };
    }

    const id = await createProjectDocument({
        project_id: customerProject.id,
        media_id: media.id,
        description: body.description?.trim() || null,
    });

    if (!id) {
        set.status = 400;
        return { error: "Failed to create project document" };
    }

    const projectDocument = await getProjectDocumentById({ id });

    set.status = 201;
    return { message: "Project document created", projectDocument };
}

export async function updateProjectDocument({ params, body, set }) {
    const projectDocument = await getProjectDocumentById({ id: params.id });
    if (!projectDocument) {
        set.status = 404;
        return { error: "Project document not found" };
    }

    const media = await getMediaById({ id: projectDocument.media_id });
    if (!media) {
        set.status = 404;
        return { error: "Media not found" };
    }

    const uploadedFile = body.file;
    if (!uploadedFile) {
        set.status = 400;
        return { error: "File is required" };
    }

    const name = String(uploadedFile.name || "file").slice(0, 64);
    const extension = filer.getExtensionByFileName(name);
    const file = extension
        ? `${filer.generateRandomFileName()}.${extension}`
        : filer.generateRandomFileName();

    await removeMediaFile(media.file);
    await Bun.write(join(Bun.env.DIRECTORY_MEDIA, file), uploadedFile);
    await updateMediaById({ id: media.id, name, file });
    await updateProjectDocumentById({
        id: projectDocument.id,
        description: body.description?.trim() || null,
    });

    const updated = await getProjectDocumentById({ id: projectDocument.id });
    set.status = 200;
    return { message: "Project document updated", projectDocument: updated };
}

export async function deleteProjectDocument({ params, set }) {
    const projectDocument = await getProjectDocumentById({ id: params.id });
    if (!projectDocument) {
        set.status = 404;
        return { error: "Project document not found" };
    }

    const media = await getMediaById({ id: projectDocument.media_id });

    await deleteProjectDocumentById({ id: projectDocument.id });

    if (media) {
        await removeMediaFile(media.file);
        await deleteMediaById({ id: media.id });
    }

    set.status = 200;
    return { message: "Project document deleted" };
}
