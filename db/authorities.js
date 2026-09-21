import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createAuthority({ title, description }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO AUTHORITIES ${sql({ title, description }, "title", "description")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createAuthority: ${error}`);
        });
}

export async function deleteAuthorityById({ id }) {
    await executeSQLQuery(
        (sql) => sql`DELETE FROM ROLE_AUTHORITIES WHERE authority_id = ${id}`,
    ).catch((error) => {
        logger.error(`deleteAuthorityById ROLE_AUTHORITIES: ${error}`);
    });
    await executeSQLQuery((sql) => sql`DELETE FROM AUTHORITIES WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteAuthorityById: ${error}`);
    });
}

export async function getAuthorityById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM AUTHORITIES WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getAuthorityById: ${error}`);
            return null;
        });
}

export async function getAuthorityByTitle({ title }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM AUTHORITIES
            WHERE title = ${title}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getAuthorityByTitle: ${error}`);
            return null;
        });
}

export async function getAllAuthorities() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM AUTHORITIES
            ORDER BY title ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllAuthorities: ${error}`);
            return [];
        });
}
