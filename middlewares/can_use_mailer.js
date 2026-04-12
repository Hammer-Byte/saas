import { ERRORS } from "../constants.js";
import { canApplicationUseService } from "../db/application_services.js";
const { SAAS,logger } = require("@hammerbyte/utils");

export default async function canUseMailer({ application, set }) {

    const MAILER_SERVICE_ID = 1;

    if (!application || !await canApplicationUseService({ application_id: application?.id, service_id: MAILER_SERVICE_ID })) {
       
        logger.error(`${SAAS.SERVICES.MAILER} Service Request Rejected`);
        set.status = 401;
        return { error: ERRORS.UNAUTHORIZED };
    }

    //check if such application does exist and is active

    logger.info(`${SAAS.SERVICES.MAILER} Service Requested verified For ${application.id}-${application.title} `);
}
