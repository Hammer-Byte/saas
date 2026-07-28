import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db";

export async function canApplicationUseService({ application_id, service_id }) {
    logger.info(`Verifying Application Service - Application : ${application_id} , Service : ${service_id}`);

    return await executeSQLQuery(
        (sql) => sql` SELECT * FROM APPLICATION_SERVICES WHERE application_id=${application_id} AND service_id=${service_id} AND active=TRUE`,
    )
        .then((result) => (result.length ? result[0] : false))
        .catch((error) => logger.error(`canApplicationUserService: ${error}`));
}

export async function getServicesByApplicationId({ application_id }) {
    logger.info(`Getting Services By Application Id : ${application_id}`);

    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                APPLICATION_SERVICES.id,
                APPLICATION_SERVICES.application_id,
                APPLICATION_SERVICES.service_id,
                APPLICATION_SERVICES.active,
                APPLICATION_SERVICES.created_on,
                APPLICATION_SERVICES.updated_at,
                SERVICES.title,
                SERVICES.description
            FROM APPLICATION_SERVICES
            INNER JOIN SERVICES ON SERVICES.id = APPLICATION_SERVICES.service_id
            WHERE APPLICATION_SERVICES.application_id = ${application_id}
            ORDER BY SERVICES.id ASC
        `,
    )
        .then((result) => result ?? [])
        .catch((error) => {
            logger.error(`getServicesByApplicationId: ${error}`);
            return [];
        });
}
