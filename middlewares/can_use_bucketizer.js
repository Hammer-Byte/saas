import { ERRORS } from "../constants.js";
import { canApplicationUseService } from "../db/application_services.js";
const { CONSTANTS, logger } = require("@hammerbyte/utils");

export default async function canUseBucketizer({ application, set }) {
    const BUCKETIZER_SERVICE_ID = 2;

    const applicationService = await canApplicationUseService({ application_id: application?.id, service_id: BUCKETIZER_SERVICE_ID });


    if (
        !application ||
        !applicationService)
     {
        logger.error(`${CONSTANTS.SAAS.SERVICES.BUCKETIZER} Service Request Rejected`);
        set.status = 401;
        return { error: ERRORS.UNAUTHORIZED };
    }

    application.service = applicationService;


    logger.info(
        `${CONSTANTS.SAAS.SERVICES.BUCKETIZER} Service Requested verified For ${application.title} `,
    );
}


