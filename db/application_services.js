import { executeSQLQuery } from "../libs/db";

const { logger } = require("@hammerbyte/utils");

export async function canApplicationUseService({ application_id, service_id }) {
    logger.info(`Verifying Application Service - Application : ${application_id} , Service : ${service_id}`);

    return await executeSQLQuery(
        (sql) => sql` SELECT * FROM APPLICATION_SERVICES WHERE application_id=${application_id} AND service_id=${service_id} AND active=TRUE`,
    )
        .then((result) => (result.length ? result[0] : false))
        .catch((error) => logger.error(`canApplicationUserService: ${error}`));
}
