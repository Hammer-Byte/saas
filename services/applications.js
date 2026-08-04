import { createApplication, getApplicationById, updateApplicationById } from "../db/applications.js";

export async function addApplication({ body, set }) {
    const id = await createApplication({
        title: body.title.trim(),
        active: body.active === undefined ? true : Boolean(body.active),
    });

    const application = await getApplicationById({ id });

    set.status = 201;
    return { message: "Application created", application };
}

export async function updateApplication({ params, body, set }) {
    const id = Number(params.id);
    const application = await getApplicationById({ id });
    if (!application) {
        set.status = 404;
        return { error: "Application not found" };
    }

    await updateApplicationById({
        id,
        title: body.title.trim(),
        token: body.token.trim(),
        active: Boolean(body.active),
    });

    const updated = await getApplicationById({ id });

    set.status = 200;
    return { message: "Application updated", application: updated };
}
