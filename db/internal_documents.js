import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createInternalDocument({ media_id, description = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO INTERNAL_DOCUMENTS ${sql(
                { media_id, description },
                "media_id",
                "description",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createInternalDocument: ${error}`);
        });
}

export async function getInternalDocumentById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                INTERNAL_DOCUMENTS.*,
                MEDIA.name AS media_name
            FROM INTERNAL_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = INTERNAL_DOCUMENTS.media_id
            WHERE INTERNAL_DOCUMENTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getInternalDocumentById: ${error}`);
            return null;
        });
}

export async function getAllInternalDocuments() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                INTERNAL_DOCUMENTS.*,
                MEDIA.name AS media_name
            FROM INTERNAL_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = INTERNAL_DOCUMENTS.media_id
            ORDER BY INTERNAL_DOCUMENTS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllInternalDocuments: ${error}`);
            return [];
        });
}

export async function updateInternalDocumentById({ id, description = null }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE INTERNAL_DOCUMENTS
            SET description = ${description}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateInternalDocumentById: ${error}`);
    });
}

export async function deleteInternalDocumentById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM INTERNAL_DOCUMENTS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteInternalDocumentById: ${error}`);
        },
    );
}
