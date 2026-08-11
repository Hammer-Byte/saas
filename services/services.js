import {
    createService,
    deleteServiceById,
    getServiceById,
    updateServiceById,
} from "../db/services.js";

export async function addService({ body, set }) {
    const id = await createService({
        ...body,
        title: body.title.trim(),
        description: body.description.trim(),
        cost: body.cost,
    });

    const service = await getServiceById({ id });

    set.status = 201;
    return { message: "Service created", service };
}

export async function updateService({ body, set }) {
    const existing = await getServiceById({ id: body.id });
    if (!existing) {
        set.status = 404;
        return { error: "Service not found" };
    }

    await updateServiceById({
        ...body,
        title: body.title.trim(),
        description: body.description.trim(),
        cost: body.cost,
    });

    const service = await getServiceById({ id: body.id });

    set.status = 200;
    return { message: "Service updated", service };
}

export async function deleteService({ params, set }) {
    const existing = await getServiceById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Service not found" };
    }

    await deleteServiceById({ id: params.id });
    set.status = 204;
}
