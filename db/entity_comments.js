import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createEntityComment({ entity_type, entity_id, user_id, comment }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO ENTITY_COMMENTS ${sql(
                {
                    entity_type,
                    entity_id,
                    user_id,
                    comment,
                },
                "entity_type",
                "entity_id",
                "user_id",
                "comment",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createEntityComment: ${error}`);
        });
}

export async function getEntityCommentById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                ENTITY_COMMENTS.*,
                USERS.full_name AS author_name
            FROM ENTITY_COMMENTS
            INNER JOIN USERS ON USERS.id = ENTITY_COMMENTS.user_id
            WHERE ENTITY_COMMENTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getEntityCommentById: ${error}`);
            return null;
        });
}

export async function getAllEntityCommentsByEntity({ entity_type, entity_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                ENTITY_COMMENTS.*,
                USERS.full_name AS author_name
            FROM ENTITY_COMMENTS
            INNER JOIN USERS ON USERS.id = ENTITY_COMMENTS.user_id
            WHERE ENTITY_COMMENTS.entity_type = ${entity_type}
              AND ENTITY_COMMENTS.entity_id = ${entity_id}
            ORDER BY ENTITY_COMMENTS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllEntityCommentsByEntity: ${error}`);
            return [];
        });
}

export async function updateEntityCommentById({ id, comment }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE ENTITY_COMMENTS
            SET comment = ${comment}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateEntityCommentById: ${error}`);
    });
}

export async function deleteEntityCommentById({ id }) {
    await executeSQLQuery(
        (sql) => sql`
            DELETE FROM ENTITY_COMMENTS
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`deleteEntityCommentById: ${error}`);
    });
}
