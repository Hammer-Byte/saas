import { logger } from "@hammerbyte/utils";
import { CONTENT_PUBLISHER_SERVICE, ERRORS } from "../constants.js";
import { canApplicationUseService } from "../db/application_services.js";
import { getServiceByTitle } from "../db/services.js";

export default async function canUseContentPublisher({ application, set }) {
    if (!application) {
        logger.error(`${CONTENT_PUBLISHER_SERVICE} Service Request Rejected`);
        set.status = 401;
        return { error: ERRORS.UNAUTHORIZED };
    }

    const service = await getServiceByTitle({ title: CONTENT_PUBLISHER_SERVICE });
    if (!service?.id) {
        logger.error(`${CONTENT_PUBLISHER_SERVICE} Service missing from SERVICES catalog`);
        set.status = 401;
        return { error: ERRORS.UNAUTHORIZED };
    }

    const applicationService = await canApplicationUseService({
        application_id: application.id,
        service_id: service.id,
    });

    if (!applicationService) {
        logger.error(`${CONTENT_PUBLISHER_SERVICE} Service Request Rejected`);
        set.status = 401;
        return { error: ERRORS.UNAUTHORIZED };
    }

    application.service = applicationService;
    logger.info(
        `${CONTENT_PUBLISHER_SERVICE} Service Requested verified For ${application.title} `,
    );
}
