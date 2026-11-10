import { join } from "node:path";
import { filer } from "@hammerbyte/utils";
import { createMedia, getMediaById } from "../db/media.js";
import { getInternalDocumentByMediaId } from "../db/internal_documents.js";
import { getCurrentUser } from "./authentication.js";
import { canManageInternalDocuments } from "./internal_documents.js";

export async function addMedia({ body, set }) {
    const uploadedFile = body.file;
    const name = String(uploadedFile.name || "file").slice(0, 64);
    const extension = filer.getExtensionByFileName(name);
    const file = extension
        ? `${filer.generateRandomFileName()}.${extension}`
        : filer.generateRandomFileName();

    await Bun.write(join(Bun.env.DIRECTORY_MEDIA, file), uploadedFile);

    const id = await createMedia({ name, file });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create media" };
    }

    set.status = 201;
    return { id };
}

export async function getMedia({ params, cookie, set }) {
    const media = await getMediaById({ id: params.id });
    if (!media) {
        set.status = 404;
        return { error: "Media not found" };
    }

    const internalDocument = await getInternalDocumentByMediaId({ media_id: media.id });
    if (internalDocument?.visibility === "restricted") {
        const currentUser = await getCurrentUser({ cookie });
        if (!canManageInternalDocuments(currentUser)) {
            set.status = 403;
            return { error: "You do not have access to this document" };
        }
    }

    const diskFile = Bun.file(join(Bun.env.DIRECTORY_MEDIA, media.file));
    if (!(await diskFile.exists())) {
        set.status = 404;
        return { error: "File not found" };
    }

    set.headers["Content-Disposition"] = `inline; filename="${media.name.replace(/"/g, "")}"`;
    set.headers["Content-Type"] =
        filer.getContentTypeByFileName(media.file) || "application/octet-stream";

    return diskFile;
}
