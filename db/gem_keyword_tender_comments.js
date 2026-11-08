import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createGemKeywordTenderComment({
    gem_keyword_tender_id,
    user_id,
    comment,
    media_id = null,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_KEYWORD_TENDER_COMMENTS ${sql(
                {
                    gem_keyword_tender_id,
                    user_id,
                    comment,
                    media_id,
                },
                "gem_keyword_tender_id",
                "user_id",
                "comment",
                "media_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createGemKeywordTenderComment: ${error}`);
        });
}

export async function getGemKeywordTenderCommentById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_KEYWORD_TENDER_COMMENTS.*,
                MEDIA.name AS attachment_name,
                MEDIA.file AS attachment_file
            FROM GEM_KEYWORD_TENDER_COMMENTS
            LEFT JOIN MEDIA ON MEDIA.id = GEM_KEYWORD_TENDER_COMMENTS.media_id
            WHERE GEM_KEYWORD_TENDER_COMMENTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemKeywordTenderCommentById: ${error}`);
            return null;
        });
}

export async function getAllGemKeywordTenderCommentsByTenderId({ gem_keyword_tender_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                GEM_KEYWORD_TENDER_COMMENTS.*,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email,
                MEDIA.name AS attachment_name
            FROM GEM_KEYWORD_TENDER_COMMENTS
            INNER JOIN USERS ON USERS.id = GEM_KEYWORD_TENDER_COMMENTS.user_id
            LEFT JOIN MEDIA ON MEDIA.id = GEM_KEYWORD_TENDER_COMMENTS.media_id
            WHERE GEM_KEYWORD_TENDER_COMMENTS.gem_keyword_tender_id = ${gem_keyword_tender_id}
            ORDER BY GEM_KEYWORD_TENDER_COMMENTS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllGemKeywordTenderCommentsByTenderId: ${error}`);
            return [];
        });
}

export async function updateGemKeywordTenderCommentById({ id, comment }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE GEM_KEYWORD_TENDER_COMMENTS
            SET comment = ${comment}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateGemKeywordTenderCommentById: ${error}`);
    });
}

export async function deleteGemKeywordTenderCommentById({ id }) {
    await executeSQLQuery(
        (sql) => sql`
            DELETE FROM GEM_KEYWORD_TENDER_COMMENTS
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`deleteGemKeywordTenderCommentById: ${error}`);
    });
}
