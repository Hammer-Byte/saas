import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createProjectDocument({ project_id, media_id, description = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO PROJECT_DOCUMENTS ${sql(
                { project_id, media_id, description },
                "project_id",
                "media_id",
                "description",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createProjectDocument: ${error}`);
        });
}

export async function getProjectDocumentById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                PROJECT_DOCUMENTS.*,
                MEDIA.name AS media_name
            FROM PROJECT_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = PROJECT_DOCUMENTS.media_id
            WHERE PROJECT_DOCUMENTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getProjectDocumentById: ${error}`);
            return null;
        });
}

export async function getProjectDocumentsByProjectId({ project_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                PROJECT_DOCUMENTS.*,
                MEDIA.name AS media_name
            FROM PROJECT_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = PROJECT_DOCUMENTS.media_id
            WHERE PROJECT_DOCUMENTS.project_id = ${project_id}
            ORDER BY PROJECT_DOCUMENTS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getProjectDocumentsByProjectId: ${error}`);
            return [];
        });
}

export async function deleteProjectDocumentById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM PROJECT_DOCUMENTS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteProjectDocumentById: ${error}`);
        },
    );
}
