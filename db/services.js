import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createService({ title, description, cost }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVICES ${sql({ title, description, cost }, "title", "description", "cost")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createService: ${error}`);
        });
}

export async function updateServiceById({ id, title, description, cost }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVICES
            SET
                title = ${title},
                description = ${description},
                cost = ${cost}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServiceById: ${error}`);
    });
}

export async function deleteServiceById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM SERVICES WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteServiceById: ${error}`);
    });
}

export async function getServiceById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM SERVICES WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getServiceById: ${error}`);
            return null;
        });
}

export async function getAllServices() {
    logger.info("Getting All Services");
    return await executeSQLQuery((sql) => sql`SELECT * FROM SERVICES ORDER BY id ASC`)
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllServices: ${error}`);
            return [];
        });
}
