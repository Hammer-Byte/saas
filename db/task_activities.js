import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

const ACTIVITY_MAX_LENGTH = 512;

function truncateActivity(activity) {
    const text = String(activity || "").trim();
    if (!text) {
        return null;
    }
    if (text.length <= ACTIVITY_MAX_LENGTH) {
        return text;
    }
    return `${text.slice(0, ACTIVITY_MAX_LENGTH - 3)}...`;
}

export async function createTaskActivity({ task_id, user_id, activity }) {
    const activityText = truncateActivity(activity);
    if (!activityText) {
        return false;
    }

    const taskId = Number(task_id);
    const actorId = Number(user_id);
    if (!(taskId >= 1) || !(actorId >= 1)) {
        logger.error(`createTaskActivity: invalid ids task=${task_id} user=${user_id}`);
        return false;
    }

    try {
        await executeSQLQuery(
            (sql) => sql`
                INSERT INTO TASK_ACTIVITIES (
                    task_id,
                    user_id,
                    activity
                ) VALUES (
                    ${taskId},
                    ${actorId},
                    ${activityText}
                )
            `,
        );
        return true;
    } catch (error) {
        logger.error(`createTaskActivity: ${error}`);
        return false;
    }
}

export async function getAllTaskActivitiesByTaskId({ task_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASK_ACTIVITIES.*,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email
            FROM TASK_ACTIVITIES
            INNER JOIN USERS ON USERS.id = TASK_ACTIVITIES.user_id
            WHERE TASK_ACTIVITIES.task_id = ${task_id}
            ORDER BY TASK_ACTIVITIES.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllTaskActivitiesByTaskId: ${error}`);
            return [];
        });
}
