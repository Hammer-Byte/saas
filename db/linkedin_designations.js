import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createLinkedinDesignation({ name }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_DESIGNATIONS ${sql(
                {
                    name,
                },
                "name",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createLinkedinDesignation: ${error}`);
        });
}

export async function deleteLinkedinDesignationById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM LINKEDIN_DESIGNATIONS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteLinkedinDesignationById: ${error}`);
        },
    );
}

export async function getLinkedinDesignationById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM LINKEDIN_DESIGNATIONS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLinkedinDesignationById: ${error}`);
            return null;
        });
}

export async function getLinkedinDesignationByName({ name }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_DESIGNATIONS
            WHERE name = ${name}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLinkedinDesignationByName: ${error}`);
            return null;
        });
}

export async function getAllLinkedinDesignations() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_DESIGNATIONS
            ORDER BY id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinDesignations: ${error}`);
            return [];
        });
}

export async function getLinkedinDesignationsByIds({ ids }) {
    if (!ids?.length) {
        return [];
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_DESIGNATIONS
            WHERE id IN ${sql(ids)}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLinkedinDesignationsByIds: ${error}`);
            return [];
        });
}
