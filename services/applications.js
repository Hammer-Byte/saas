import { getApplicationById, updateApplicationById } from "../db/applications.js";
import { getProjectTagById } from "../db/project_tags.js";

export async function updateApplication({ params, body, set }) {
    const id = Number(params.id);
    const application = await getApplicationById({ id });
    if (!application) {
        set.status = 404;
        return { error: "Application not found" };
    }

    const project_tag_id = body.project_tag_id === null || body.project_tag_id === ""
        ? null
        : Number(body.project_tag_id);

    if (project_tag_id !== null) {
        const projectTag = await getProjectTagById({ id: project_tag_id });
        if (!projectTag) {
            set.status = 400;
            return { error: "Project tag not found" };
        }
    }

    await updateApplicationById({
        id,
        title: body.title.trim(),
        token: body.token.trim(),
        active: Boolean(body.active),
        project_tag_id,
    });

    const updated = await getApplicationById({ id });

    set.status = 200;
    return { message: "Application updated", application: updated };
}
