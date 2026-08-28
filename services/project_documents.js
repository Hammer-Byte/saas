import { getCustomerProjectById } from "../db/customer_projects.js";
import { getMediaById } from "../db/media.js";
import {
    createProjectDocument,
    getProjectDocumentById,
} from "../db/project_documents.js";

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
