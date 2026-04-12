import { ERRORS } from "../constants.js";
import { canApplicationUseService } from "../db/application_services.js";
const { SAAS, logger } = require("@hammerbyte/utils");

export default async function canUseBucketizer({ application, set }) {
    const BUCKETIZER_SERVICE_ID = 2;

    if (
        !application ||
        !(await canApplicationUseService({
            application_id: application?.id,
            service_id: BUCKETIZER_SERVICE_ID,
        }))
    ) {
        logger.error(`${SAAS.SERVICES.BUCKETIZER} Service Request Rejected`);
        set.status = 401;
        return { error: ERRORS.UNAUTHORIZED };
    }

    logger.info(
        `${SAAS.SERVICES.BUCKETIZER} Service Requested verified For ${application.id}-${application.title} `,
    );
}
