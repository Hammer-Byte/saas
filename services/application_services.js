import { getProjectApplicationById } from "../db/project_applications.js";
import { getAllServices } from "../db/services.js";
import {
    createApplicationService,
    getApplicationServiceByApplicationIdAndServiceId,
    getApplicationServiceById,
    updateApplicationServiceActiveById,
} from "../db/application_services.js";

export async function addApplicationService({ body, set }) {
    const application = await getProjectApplicationById({ id: body.application_id });
    if (!application) {
        set.status = 404;
        return { error: "Application not found" };
    }

    const { service_id } = body;
    const allServices = await getAllServices();
    const serviceExists = allServices.some((service) => service.id === service_id);
    if (!serviceExists) {
        set.status = 400;
        return { error: "Service not found" };
    }

    const existingApplicationService = await getApplicationServiceByApplicationIdAndServiceId({
        application_id: application.id,
        service_id,
    });
    if (existingApplicationService) {
        set.status = 400;
        return { error: "Service is already linked to this application" };
    }

    const id = await createApplicationService({
        ...body,
        application_id: application.id,
    });

    const applicationService = await getApplicationServiceById({ id });

    set.status = 201;
    return {
        message: "Application service added",
        applicationService,
    };
}

export async function updateApplicationService({ params, body, set }) {
    const existingApplicationService = await getApplicationServiceById({
        id: params.id,
    });

    if (!existingApplicationService) {
        set.status = 404;
        return { error: "Application service not found" };
    }

    await updateApplicationServiceActiveById({
        id: existingApplicationService.id,
        active: body.active,
    });

    const updatedApplicationService = await getApplicationServiceById({
        id: existingApplicationService.id,
    });

    set.status = 200;
    return {
        message: "Application service updated",
        applicationService: updatedApplicationService,
    };
}
