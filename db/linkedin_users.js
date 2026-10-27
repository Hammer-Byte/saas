import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createLinkedinUser({ name, cookie }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_USERS ${sql(
                {
                    name,
                    cookie,
                },
                "name",
                "cookie",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createLinkedinUser: ${error}`);
        });
}

export async function updateLinkedinUserById({ id, name, cookie }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE LINKEDIN_USERS
            SET
                name = ${name},
                cookie = ${cookie}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateLinkedinUserById: ${error}`);
    });
}

export async function deleteLinkedinUserById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM LINKEDIN_USERS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteLinkedinUserById: ${error}`);
        },
    );
}

export async function getLinkedinUserById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM LINKEDIN_USERS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLinkedinUserById: ${error}`);
            return null;
        });
}

export async function getLinkedinUserByName({ name }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_USERS
            WHERE name = ${name}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLinkedinUserByName: ${error}`);
            return null;
        });
}

export async function getAllLinkedinUsers() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_USERS
            ORDER BY id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinUsers: ${error}`);
            return [];
        });
}

export async function getLinkedinUsersByIds({ ids }) {
    if (!ids?.length) {
        return [];
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_USERS
            WHERE id IN ${sql(ids)}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLinkedinUsersByIds: ${error}`);
            return [];
        });
}
