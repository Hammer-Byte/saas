import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createLeadSource({ title }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LEAD_SOURCES ${sql({ title }, "title")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createLeadSource: ${error}`);
        });
}

export async function updateLeadSourceById({ id, title }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE LEAD_SOURCES
            SET title = ${title}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateLeadSourceById: ${error}`);
    });
}

export async function deleteLeadSourceById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM LEAD_SOURCES WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteLeadSourceById: ${error}`);
        },
    );
}

export async function getLeadSourceById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM LEAD_SOURCES WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLeadSourceById: ${error}`);
            return null;
        });
}

export async function getLeadSourceByTitle({ title }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LEAD_SOURCES
            WHERE title = ${title}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLeadSourceByTitle: ${error}`);
            return null;
        });
}

export async function getAllLeadSources() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LEAD_SOURCES
            ORDER BY title ASC, id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLeadSources: ${error}`);
            return [];
        });
}
