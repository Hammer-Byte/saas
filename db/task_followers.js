import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createTaskFollower({ task_id, user_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO TASK_FOLLOWERS ${sql(
                {
                    task_id,
                    user_id,
                },
                "task_id",
                "user_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createTaskFollower: ${error}`);
        });
}

export async function getTaskFollowerByTaskIdAndUserId({ task_id, user_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT TASK_FOLLOWERS.*
            FROM TASK_FOLLOWERS
            WHERE TASK_FOLLOWERS.task_id = ${task_id}
              AND TASK_FOLLOWERS.user_id = ${user_id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getTaskFollowerByTaskIdAndUserId: ${error}`);
            return null;
        });
}

export async function getAllTaskFollowersByTaskId({ task_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASK_FOLLOWERS.*,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email,
                USERS.personal_email AS user_personal_email
            FROM TASK_FOLLOWERS
            INNER JOIN USERS ON USERS.id = TASK_FOLLOWERS.user_id
            WHERE TASK_FOLLOWERS.task_id = ${task_id}
            ORDER BY USERS.full_name ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllTaskFollowersByTaskId: ${error}`);
            return [];
        });
}

export async function deleteTaskFollowerByTaskIdAndUserId({ task_id, user_id }) {
    await executeSQLQuery(
        (sql) => sql`
            DELETE FROM TASK_FOLLOWERS
            WHERE task_id = ${task_id}
              AND user_id = ${user_id}
        `,
    ).catch((error) => {
        logger.error(`deleteTaskFollowerByTaskIdAndUserId: ${error}`);
    });
}
