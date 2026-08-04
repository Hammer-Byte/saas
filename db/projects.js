import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createProject({ title, description = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO PROJECTS ${sql(
                { title, description },
                "title",
                "description",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createProject: ${error}`);
            throw error;
        });
}

export async function updateProjectById({ id, title, description }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE PROJECTS
            SET
                title = ${title},
                description = ${description}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateProjectById: ${error}`);
        throw error;
    });
}

export async function deleteProjectById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM PROJECTS WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteProjectById: ${error}`);
        throw error;
    });
}

export async function getProjectById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM PROJECTS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getProjectById: ${error}`);
            return null;
        });
}

export async function getAllProjects() {
    return await executeSQLQuery((sql) => sql`SELECT * FROM PROJECTS ORDER BY title ASC`)
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllProjects: ${error}`);
            return [];
        });
}
