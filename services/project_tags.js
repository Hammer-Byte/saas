import {
    createProjectTag,
    deleteProjectTagById,
    getAllProjectTags,
    getProjectTagById,
    updateProjectTagById,
} from "../db/project_tags.js";

export async function addProjectTag({ body, set }) {
    const id = await createProjectTag({ title: body.title.trim() });
    const projectTag = await getProjectTagById({ id });

    set.status = 201;
    return { message: "Project tag created", projectTag };
}

export async function updateProjectTag({ body, set }) {
    const existing = await getProjectTagById({ id: body.id });
    if (!existing) {
        set.status = 404;
        return { error: "Project tag not found" };
    }

    await updateProjectTagById({ id: body.id, title: body.title.trim() });
    const projectTag = await getProjectTagById({ id: body.id });

    set.status = 200;
    return { message: "Project tag updated", projectTag };
}

export async function deleteProjectTag({ params, set }) {
    const existing = await getProjectTagById({ id: Number(params.id) });
    if (!existing) {
        set.status = 404;
        return { error: "Project tag not found" };
    }

    await deleteProjectTagById({ id: Number(params.id) });
    set.status = 204;
}

export async function getProjectTags() {
    return await getAllProjectTags();
}
