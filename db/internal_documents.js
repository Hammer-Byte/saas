import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createInternalDocument({
    media_id,
    description = null,
    visibility = "restricted",
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO INTERNAL_DOCUMENTS ${sql(
                { media_id, description, visibility },
                "media_id",
                "description",
                "visibility",
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

export async function getInternalDocumentByMediaId({ media_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                INTERNAL_DOCUMENTS.*,
                MEDIA.name AS media_name
            FROM INTERNAL_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = INTERNAL_DOCUMENTS.media_id
            WHERE INTERNAL_DOCUMENTS.media_id = ${media_id}
            ORDER BY INTERNAL_DOCUMENTS.id DESC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getInternalDocumentByMediaId: ${error}`);
            return null;
        });
}

export async function getAllInternalDocuments({ visibility = null } = {}) {
    const query =
        visibility == null
            ? (sql) => sql`
                SELECT
                    INTERNAL_DOCUMENTS.*,
                    MEDIA.name AS media_name
                FROM INTERNAL_DOCUMENTS
                INNER JOIN MEDIA ON MEDIA.id = INTERNAL_DOCUMENTS.media_id
                ORDER BY INTERNAL_DOCUMENTS.created_on DESC
            `
            : (sql) => sql`
                SELECT
                    INTERNAL_DOCUMENTS.*,
                    MEDIA.name AS media_name
                FROM INTERNAL_DOCUMENTS
                INNER JOIN MEDIA ON MEDIA.id = INTERNAL_DOCUMENTS.media_id
                WHERE INTERNAL_DOCUMENTS.visibility = ${visibility}
                ORDER BY INTERNAL_DOCUMENTS.created_on DESC
            `;

    return await executeSQLQuery(query)
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllInternalDocuments: ${error}`);
            return [];
        });
}

export async function updateInternalDocumentById({
    id,
    description = null,
    visibility = "restricted",
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE INTERNAL_DOCUMENTS
            SET description = ${description},
                visibility = ${visibility}
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

export async function countInternalDocumentsByMediaId({ media_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COUNT(*) AS count
            FROM INTERNAL_DOCUMENTS
            WHERE media_id = ${media_id}
        `,
    )
        .then((result) => Number(result?.[0]?.count || 0))
        .catch((error) => {
            logger.error(`countInternalDocumentsByMediaId: ${error}`);
            return 0;
        });
}
