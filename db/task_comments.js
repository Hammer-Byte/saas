import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createTaskComment({ task_id, user_id, comment, media_id = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO TASK_COMMENTS ${sql(
                {
                    task_id,
                    user_id,
                    comment,
                    media_id,
                },
                "task_id",
                "user_id",
                "comment",
                "media_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createTaskComment: ${error}`);
        });
}

export async function getTaskCommentById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASK_COMMENTS.*,
                MEDIA.name AS attachment_name,
                MEDIA.file AS attachment_file
            FROM TASK_COMMENTS
            LEFT JOIN MEDIA ON MEDIA.id = TASK_COMMENTS.media_id
            WHERE TASK_COMMENTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getTaskCommentById: ${error}`);
            return null;
        });
}

export async function getAllTaskCommentsByTaskId({ task_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASK_COMMENTS.*,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email,
                MEDIA.name AS attachment_name
            FROM TASK_COMMENTS
            INNER JOIN USERS ON USERS.id = TASK_COMMENTS.user_id
            LEFT JOIN MEDIA ON MEDIA.id = TASK_COMMENTS.media_id
            WHERE TASK_COMMENTS.task_id = ${task_id}
            ORDER BY TASK_COMMENTS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllTaskCommentsByTaskId: ${error}`);
            return [];
        });
}

export async function updateTaskCommentById({ id, comment }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE TASK_COMMENTS
            SET comment = ${comment}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateTaskCommentById: ${error}`);
    });
}

export async function deleteTaskCommentById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM TASK_COMMENTS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteTaskCommentById: ${error}`);
        },
    );
}
