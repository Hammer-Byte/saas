import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemDocument({ media_id, description = null, created_by = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_DOCUMENTS ${sql(
                {
                    media_id,
                    description,
                    created_by:
                        created_by != null && Number(created_by) >= 1
                            ? Number(created_by)
                            : null,
                },
                "media_id",
                "description",
                "created_by",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemDocument: ${error}`);
        });
}

export async function getGemDocumentById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_DOCUMENTS.*,
                MEDIA.name AS media_name,
                USERS.full_name AS creator_full_name
            FROM GEM_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = GEM_DOCUMENTS.media_id
            LEFT JOIN USERS ON USERS.id = GEM_DOCUMENTS.created_by
            WHERE GEM_DOCUMENTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemDocumentById: ${error}`);
            return null;
        });
}

export async function getGemDocumentByMediaId({ media_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_DOCUMENTS.*,
                MEDIA.name AS media_name,
                USERS.full_name AS creator_full_name
            FROM GEM_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = GEM_DOCUMENTS.media_id
            LEFT JOIN USERS ON USERS.id = GEM_DOCUMENTS.created_by
            WHERE GEM_DOCUMENTS.media_id = ${media_id}
            ORDER BY GEM_DOCUMENTS.id DESC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemDocumentByMediaId: ${error}`);
            return null;
        });
}

export async function getAllGemDocuments() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_DOCUMENTS.*,
                MEDIA.name AS media_name,
                USERS.full_name AS creator_full_name
            FROM GEM_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = GEM_DOCUMENTS.media_id
            LEFT JOIN USERS ON USERS.id = GEM_DOCUMENTS.created_by
            ORDER BY GEM_DOCUMENTS.created_on DESC, GEM_DOCUMENTS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemDocuments: ${error}`);
            return [];
        });
}

export async function updateGemDocumentById({ id, description = null }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_DOCUMENTS
            SET description = ${description}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateGemDocumentById: ${error}`);
    });
}

export async function deleteGemDocumentById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM GEM_DOCUMENTS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteGemDocumentById: ${error}`);
        },
    );
}

export async function countGemDocumentsByMediaId({ media_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COUNT(*) AS count
            FROM GEM_DOCUMENTS
            WHERE media_id = ${media_id}
        `,
    )
        .then((result) => Number(result?.[0]?.count || 0))
        .catch((error) => {
            logger.error(`countGemDocumentsByMediaId: ${error}`);
            return 0;
        });
}
