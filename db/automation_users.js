import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createAutomationUser({
    name,
    instagram_cookie = null,
    instagram_user_id = null,
    youtube_cookie = null,
    youtube_channel_id = null,
    linkedin_cookie = null,
    linkedin_company_id = null,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO AUTOMATION_USERS ${sql(
                {
                    name,
                    instagram_cookie,
                    instagram_user_id,
                    youtube_cookie,
                    youtube_channel_id,
                    linkedin_cookie,
                    linkedin_company_id,
                },
                "name",
                "instagram_cookie",
                "instagram_user_id",
                "youtube_cookie",
                "youtube_channel_id",
                "linkedin_cookie",
                "linkedin_company_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createAutomationUser: ${error}`);
        });
}

export async function updateAutomationUserById({
    id,
    name,
    instagram_cookie = null,
    instagram_user_id = null,
    youtube_cookie = null,
    youtube_channel_id = null,
    linkedin_cookie = null,
    linkedin_company_id = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE AUTOMATION_USERS
            SET
                name = ${name},
                instagram_cookie = ${instagram_cookie},
                instagram_user_id = ${instagram_user_id},
                youtube_cookie = ${youtube_cookie},
                youtube_channel_id = ${youtube_channel_id},
                linkedin_cookie = ${linkedin_cookie},
                linkedin_company_id = ${linkedin_company_id}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateAutomationUserById: ${error}`);
    });
}

export async function deleteAutomationUserById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM AUTOMATION_USERS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteAutomationUserById: ${error}`);
        },
    );
}

export async function getAutomationUserById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM AUTOMATION_USERS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getAutomationUserById: ${error}`);
            return null;
        });
}

export async function getAutomationUserByName({ name }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM AUTOMATION_USERS
            WHERE name = ${name}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getAutomationUserByName: ${error}`);
            return null;
        });
}

export async function getAllAutomationUsers() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM AUTOMATION_USERS
            ORDER BY id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllAutomationUsers: ${error}`);
            return [];
        });
}

export async function getAutomationUsersByIds({ ids }) {
    if (!ids?.length) {
        return [];
    }

    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM AUTOMATION_USERS
            WHERE id IN ${sql(ids)}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAutomationUsersByIds: ${error}`);
            return [];
        });
}
