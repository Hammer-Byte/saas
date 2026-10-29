import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createLinkedinDesignationMessage({ designation_id, message }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO LINKEDIN_DESIGNATION_MESSAGES ${sql(
                {
                    designation_id,
                    message,
                },
                "designation_id",
                "message",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createLinkedinDesignationMessage: ${error}`);
        });
}

export async function deleteLinkedinDesignationMessageById({ id }) {
    await executeSQLQuery(
        (sql) => sql`DELETE FROM LINKEDIN_DESIGNATION_MESSAGES WHERE id = ${id}`,
    ).catch((error) => {
        logger.error(`deleteLinkedinDesignationMessageById: ${error}`);
    });
}

export async function getLinkedinDesignationMessageById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`SELECT * FROM LINKEDIN_DESIGNATION_MESSAGES WHERE id = ${id}`,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLinkedinDesignationMessageById: ${error}`);
            return null;
        });
}

export async function getAllLinkedinDesignationMessages() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                m.*,
                d.name AS designation_name
            FROM LINKEDIN_DESIGNATION_MESSAGES m
            INNER JOIN LINKEDIN_DESIGNATIONS d ON d.id = m.designation_id
            ORDER BY d.name ASC, m.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllLinkedinDesignationMessages: ${error}`);
            return [];
        });
}

export async function getLinkedinDesignationMessagesByDesignationId({ designation_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM LINKEDIN_DESIGNATION_MESSAGES
            WHERE designation_id = ${designation_id}
            ORDER BY id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLinkedinDesignationMessagesByDesignationId: ${error}`);
            return [];
        });
}

export async function getLinkedinDesignationMessagesByDesignationIds({ designation_ids }) {
    if (!designation_ids?.length) {
        return [];
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                m.*,
                d.name AS designation_name
            FROM LINKEDIN_DESIGNATION_MESSAGES m
            INNER JOIN LINKEDIN_DESIGNATIONS d ON d.id = m.designation_id
            WHERE m.designation_id IN ${sql(designation_ids)}
            ORDER BY m.designation_id ASC, m.id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getLinkedinDesignationMessagesByDesignationIds: ${error}`);
            return [];
        });
}
