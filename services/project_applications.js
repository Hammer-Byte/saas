import { getCustomerProjectById } from "../db/customer_projects.js";
import {
    createProjectApplication,
    getProjectApplicationById,
    updateProjectApplicationById,
} from "../db/project_applications.js";

export async function addProjectApplication({ body, set }) {
    const project = await getCustomerProjectById({ id: body.project_id });
    if (!project) {
        set.status = 400;
        return { error: "Customer project not found" };
    }

    const id = await createProjectApplication({
        title: body.title.trim(),
        project_id: project.id,
    });

    const application = await getProjectApplicationById({ id });

    set.status = 201;
    return { message: "Project application created", application };
}

export async function updateProjectApplication({ params, body, set }) {
    const { id } = params;
    const existingApplication = await getProjectApplicationById({ id });
    if (!existingApplication) {
        set.status = 404;
        return { error: "Project application not found" };
    }

    const project = await getCustomerProjectById({ id: body.project_id });
    if (!project) {
        set.status = 400;
        return { error: "Customer project not found" };
    }

    await updateProjectApplicationById({
        ...body,
        id,
        title: body.title.trim(),
        token: body.token.trim(),
        project_id: project.id,
    });

    const updatedApplication = await getProjectApplicationById({ id });

    set.status = 200;
    return { message: "Project application updated", application: updatedApplication };
}
