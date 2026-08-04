import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getActiveApplicationByIdAndToken({ id, token }) {
    logger.info(`Getting Application : ${id}  By Token : ${token}`);
    return await executeSQLQuery((sql) => sql`SELECT * FROM APPLICATIONS WHERE id=${id} AND token=${token} AND active=TRUE`)
        .then((result) => (result.length ? result[0] : false))
        .catch((error) => logger.error(`getActiveApplicationByIdAndToken: ${error}`));
}

export async function getAllApplications() {
    logger.info("Getting All Applications");
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                APPLICATIONS.id,
                APPLICATIONS.title,
                APPLICATIONS.token,
                APPLICATIONS.active,
                APPLICATIONS.created_on,
                APPLICATIONS.updated_at
            FROM APPLICATIONS
            ORDER BY APPLICATIONS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllApplications: ${error}`);
            return [];
        });
}

export async function getApplicationById({ id }) {
    logger.info(`Getting Application By Id : ${id}`);
    return await executeSQLQuery((sql) => sql`SELECT * FROM APPLICATIONS WHERE id=${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getApplicationById: ${error}`);
            return null;
        });
}

export async function createApplication({ title, active = true }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO APPLICATIONS ${sql(
                { title, active },
                "title",
                "active",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createApplication: ${error}`);
            throw error;
        });
}

export async function updateApplicationById({ id, title, token, active }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE APPLICATIONS
            SET
                title = ${title},
                token = ${token},
                active = ${active}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateApplicationById: ${error}`);
        throw error;
    });
}
