import { ERRORS } from "../constants.js";
import { canApplicationUseService } from "../db/application_services.js";
const { CONSTANTS, logger } = require("@hammerbyte/utils");

export default async function canUseMailer({ application, set }) {

    const MAILER_SERVICE_ID = 1;

    const applicationService = await canApplicationUseService({ application_id: application?.id, service_id: MAILER_SERVICE_ID });

    //check if such application does exist and is active
    if (!application || !applicationService) {
       
        logger.error(`${CONSTANTS.SAAS.SERVICES.MAILER} Service Request Rejected`);
        set.status = 401;
        return { error: ERRORS.UNAUTHORIZED };
    }

    application.service = applicationService;
    logger.info(`${CONSTANTS.SAAS.SERVICES.MAILER} Service Requested verified For ${application.title} `);
}
