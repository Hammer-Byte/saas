import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createProjectTag({ title }) {
    return await executeSQLQuery(
        (sql) => sql`INSERT INTO PROJECT_TAGS ${sql({ title }, "title")}`,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createProjectTag: ${error}`);
            throw error;
        });
}

export async function updateProjectTagById({ id, title }) {
    await executeSQLQuery(
        (sql) => sql`UPDATE PROJECT_TAGS SET title = ${title} WHERE id = ${id}`,
    ).catch((error) => {
        logger.error(`updateProjectTagById: ${error}`);
        throw error;
    });
}

export async function deleteProjectTagById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM PROJECT_TAGS WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteProjectTagById: ${error}`);
        throw error;
    });
}

export async function getProjectTagById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM PROJECT_TAGS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getProjectTagById: ${error}`);
            return null;
        });
}

export async function getAllProjectTags() {
    return await executeSQLQuery((sql) => sql`SELECT * FROM PROJECT_TAGS ORDER BY title ASC`)
        .then((result) => result ?? [])
        .catch((error) => {
            logger.error(`getAllProjectTags: ${error}`);
            return [];
        });
}
