import { getCustomerProjectById } from "../db/customer_projects.js";
import {
    createProjectApplication,
    getProjectApplicationById,
    updateProjectApplicationById,
} from "../db/project_applications.js";

export async function addProjectApplication({ body, set }) {
    const project = await getCustomerProjectById({ id: Number(body.project_id) });
    if (!project) {
        set.status = 400;
        return { error: "Customer project not found" };
    }

    const id = await createProjectApplication({
        ...body,
        title: body.title.trim(),
        active: body.active === undefined ? true : Boolean(body.active),
        project_id: project.id,
    });

    const application = await getProjectApplicationById({ id });

    set.status = 201;
    return { message: "Project application created", application };
}

export async function updateProjectApplication({ params, body, set }) {
    const id = Number(params.id);
    const application = await getProjectApplicationById({ id });
    if (!application) {
        set.status = 404;
        return { error: "Project application not found" };
    }

    const project = await getCustomerProjectById({ id: Number(body.project_id) });
    if (!project) {
        set.status = 400;
        return { error: "Customer project not found" };
    }

    await updateProjectApplicationById({
        ...body,
        id,
        title: body.title.trim(),
        token: body.token.trim(),
        active: Boolean(body.active),
        project_id: project.id,
    });

    const updated = await getProjectApplicationById({ id });

    set.status = 200;
    return { message: "Project application updated", application: updated };
}
