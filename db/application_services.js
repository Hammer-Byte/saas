import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createApplicationService({ application_id, service_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO APPLICATION_SERVICES ${sql(
                { application_id, service_id },
                "application_id",
                "service_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createApplicationService: ${error}`);
            throw error;
        });
}

export async function updateApplicationServiceActiveById({ id, active }) {
    await executeSQLQuery(
        (sql) => sql`UPDATE APPLICATION_SERVICES SET active = ${active} WHERE id = ${id}`,
    ).catch((error) => {
        logger.error(`updateApplicationServiceActiveById: ${error}`);
        throw error;
    });
}

export async function getApplicationServiceByApplicationIdAndServiceId({ application_id, service_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT * FROM APPLICATION_SERVICES
            WHERE application_id = ${application_id} AND service_id = ${service_id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getApplicationServiceByApplicationIdAndServiceId: ${error}`);
            return null;
        });
}

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

export async function getApplicationServiceById({ id }) {
    logger.info(`Getting Application Service By Id : ${id}`);

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
            WHERE APPLICATION_SERVICES.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getApplicationServiceById: ${error}`);
            return null;
        });
}
