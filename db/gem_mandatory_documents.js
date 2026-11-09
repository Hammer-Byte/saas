import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemMandatoryDocument({ media_id, description = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_MANDATORY_DOCUMENTS ${sql(
                { media_id, description },
                "media_id",
                "description",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemMandatoryDocument: ${error}`);
        });
}

export async function getGemMandatoryDocumentById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_MANDATORY_DOCUMENTS.*,
                MEDIA.name AS media_name
            FROM GEM_MANDATORY_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = GEM_MANDATORY_DOCUMENTS.media_id
            WHERE GEM_MANDATORY_DOCUMENTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemMandatoryDocumentById: ${error}`);
            return null;
        });
}

export async function getGemMandatoryDocumentByMediaId({ media_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_MANDATORY_DOCUMENTS.*,
                MEDIA.name AS media_name
            FROM GEM_MANDATORY_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = GEM_MANDATORY_DOCUMENTS.media_id
            WHERE GEM_MANDATORY_DOCUMENTS.media_id = ${media_id}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemMandatoryDocumentByMediaId: ${error}`);
            return null;
        });
}

export async function getAllGemMandatoryDocuments() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_MANDATORY_DOCUMENTS.*,
                MEDIA.name AS media_name
            FROM GEM_MANDATORY_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = GEM_MANDATORY_DOCUMENTS.media_id
            ORDER BY GEM_MANDATORY_DOCUMENTS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemMandatoryDocuments: ${error}`);
            return [];
        });
}

export async function updateGemMandatoryDocumentById({ id, description = null }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_MANDATORY_DOCUMENTS
            SET description = ${description}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateGemMandatoryDocumentById: ${error}`);
    });
}

export async function deleteGemMandatoryDocumentById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM GEM_MANDATORY_DOCUMENTS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteGemMandatoryDocumentById: ${error}`);
        },
    );
}

export async function countGemMandatoryDocumentsByMediaId({ media_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COUNT(*) AS count
            FROM GEM_MANDATORY_DOCUMENTS
            WHERE media_id = ${media_id}
        `,
    )
        .then((result) => Number(result?.[0]?.count || 0))
        .catch((error) => {
            logger.error(`countGemMandatoryDocumentsByMediaId: ${error}`);
            return 0;
        });
}
