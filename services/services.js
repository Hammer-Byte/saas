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
    });

    const service = await getServiceById({ id });

    set.status = 201;
    return { message: "Service created", service };
}

export async function updateService({ body, set }) {
    const existingService = await getServiceById({ id: body.id });
    if (!existingService) {
        set.status = 404;
        return { error: "Service not found" };
    }

    await updateServiceById({
        ...body,
        title: body.title.trim(),
        description: body.description.trim(),
    });

    const service = await getServiceById({ id: body.id });

    set.status = 200;
    return { message: "Service updated", service };
}

export async function deleteService({ params, set }) {
    const existingService = await getServiceById({ id: params.id });
    if (!existingService) {
        set.status = 404;
        return { error: "Service not found" };
    }

    await deleteServiceById({ id: params.id });
    set.status = 204;
}
