import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createTaskAttachment({
    task_id,
    media_id,
    description = null,
    created_by_user_id,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO TASK_ATTACHMENTS ${sql(
                {
                    task_id,
                    media_id,
                    description,
                    created_by_user_id,
                },
                "task_id",
                "media_id",
                "description",
                "created_by_user_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createTaskAttachment: ${error}`);
        });
}

export async function getTaskAttachmentById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASK_ATTACHMENTS.*,
                MEDIA.name AS media_name,
                MEDIA.file AS media_file,
                USERS.full_name AS created_by_full_name
            FROM TASK_ATTACHMENTS
            INNER JOIN MEDIA ON MEDIA.id = TASK_ATTACHMENTS.media_id
            INNER JOIN USERS ON USERS.id = TASK_ATTACHMENTS.created_by_user_id
            WHERE TASK_ATTACHMENTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getTaskAttachmentById: ${error}`);
            return null;
        });
}

export async function getAllTaskAttachmentsByTaskId({ task_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASK_ATTACHMENTS.*,
                MEDIA.name AS media_name,
                USERS.full_name AS created_by_full_name
            FROM TASK_ATTACHMENTS
            INNER JOIN MEDIA ON MEDIA.id = TASK_ATTACHMENTS.media_id
            INNER JOIN USERS ON USERS.id = TASK_ATTACHMENTS.created_by_user_id
            WHERE TASK_ATTACHMENTS.task_id = ${task_id}
            ORDER BY TASK_ATTACHMENTS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllTaskAttachmentsByTaskId: ${error}`);
            return [];
        });
}

export async function deleteTaskAttachmentById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM TASK_ATTACHMENTS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteTaskAttachmentById: ${error}`);
        },
    );
}
