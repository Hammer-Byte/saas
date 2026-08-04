import {
    createProject,
    deleteProjectById,
    getAllProjects,
    getProjectById,
    updateProjectById,
} from "../db/projects.js";

export async function addProject({ body, set }) {
    const id = await createProject({
        title: body.title.trim(),
        description: body.description?.trim() || null,
    });

    const project = await getProjectById({ id });

    set.status = 201;
    return { message: "Project created", project };
}

export async function updateProject({ body, set }) {
    const existing = await getProjectById({ id: body.id });
    if (!existing) {
        set.status = 404;
        return { error: "Project not found" };
    }

    await updateProjectById({
        id: body.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
    });

    const project = await getProjectById({ id: body.id });

    set.status = 200;
    return { message: "Project updated", project };
}

export async function deleteProject({ params, set }) {
    const existing = await getProjectById({ id: Number(params.id) });
    if (!existing) {
        set.status = 404;
        return { error: "Project not found" };
    }

    await deleteProjectById({ id: Number(params.id) });
    set.status = 204;
}

export async function getProjects() {
    return await getAllProjects();
}
