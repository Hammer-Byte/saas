import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemTenderDocument({
    gem_tender_id,
    media_id,
    name,
    created_by = null,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_TENDER_DOCUMENTS ${sql(
                {
                    gem_tender_id,
                    media_id,
                    name,
                    created_by,
                },
                "gem_tender_id",
                "media_id",
                "name",
                "created_by",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemTenderDocument: ${error}`);
        });
}

export async function getGemTenderDocumentById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_TENDER_DOCUMENTS.*,
                MEDIA.name AS media_name,
                MEDIA.file AS media_file,
                USERS.full_name AS created_by_full_name,
                USERS.email AS created_by_email
            FROM GEM_TENDER_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = GEM_TENDER_DOCUMENTS.media_id
            LEFT JOIN USERS ON USERS.id = GEM_TENDER_DOCUMENTS.created_by
            WHERE GEM_TENDER_DOCUMENTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemTenderDocumentById: ${error}`);
            return null;
        });
}

export async function getAllGemTenderDocumentsByTenderId({ gem_tender_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_TENDER_DOCUMENTS.*,
                MEDIA.name AS media_name,
                MEDIA.file AS media_file,
                USERS.full_name AS created_by_full_name,
                USERS.email AS created_by_email
            FROM GEM_TENDER_DOCUMENTS
            INNER JOIN MEDIA ON MEDIA.id = GEM_TENDER_DOCUMENTS.media_id
            LEFT JOIN USERS ON USERS.id = GEM_TENDER_DOCUMENTS.created_by
            WHERE GEM_TENDER_DOCUMENTS.gem_tender_id = ${gem_tender_id}
            ORDER BY GEM_TENDER_DOCUMENTS.created_on DESC, GEM_TENDER_DOCUMENTS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemTenderDocumentsByTenderId: ${error}`);
            return [];
        });
}

export async function deleteGemTenderDocumentById({ id }) {
    await executeSQLQuery(
        (sql) => sql`DELETE FROM GEM_TENDER_DOCUMENTS WHERE id = ${id}`,
    ).catch((error) => {
        logger.error(`deleteGemTenderDocumentById: ${error}`);
    });
}

export async function countGemTenderDocumentsByMediaId({ media_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COUNT(*) AS count
            FROM GEM_TENDER_DOCUMENTS
            WHERE media_id = ${media_id}
        `,
    )
        .then((result) => Number(result?.[0]?.count || 0))
        .catch((error) => {
            logger.error(`countGemTenderDocumentsByMediaId: ${error}`);
            return 0;
        });
}
