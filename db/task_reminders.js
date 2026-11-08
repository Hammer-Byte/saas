import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createTaskReminder({
    task_id,
    remind_at,
    recipient_user_id,
    created_by_user_id,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO TASK_REMINDERS ${sql(
                {
                    task_id,
                    remind_at,
                    recipient_user_id,
                    created_by_user_id,
                },
                "task_id",
                "remind_at",
                "recipient_user_id",
                "created_by_user_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createTaskReminder: ${error}`);
        });
}

export async function getTaskReminderById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASK_REMINDERS.*,
                RECIPIENT.full_name AS recipient_full_name,
                RECIPIENT.email AS recipient_email,
                RECIPIENT.personal_email AS recipient_personal_email
            FROM TASK_REMINDERS
            INNER JOIN USERS AS RECIPIENT ON RECIPIENT.id = TASK_REMINDERS.recipient_user_id
            WHERE TASK_REMINDERS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getTaskReminderById: ${error}`);
            return null;
        });
}

export async function getAllTaskRemindersByTaskId({ task_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASK_REMINDERS.*,
                RECIPIENT.full_name AS recipient_full_name,
                RECIPIENT.email AS recipient_email,
                CREATOR.full_name AS created_by_full_name
            FROM TASK_REMINDERS
            INNER JOIN USERS AS RECIPIENT ON RECIPIENT.id = TASK_REMINDERS.recipient_user_id
            INNER JOIN USERS AS CREATOR ON CREATOR.id = TASK_REMINDERS.created_by_user_id
            WHERE TASK_REMINDERS.task_id = ${task_id}
            ORDER BY TASK_REMINDERS.remind_at ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllTaskRemindersByTaskId: ${error}`);
            return [];
        });
}

export async function getPendingTaskReminders({ now }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASK_REMINDERS.*,
                TASKS.title AS task_title,
                TASKS.state AS task_state,
                TASKS.end_at AS task_end_at,
                RECIPIENT.full_name AS recipient_full_name,
                RECIPIENT.email AS recipient_email,
                RECIPIENT.personal_email AS recipient_personal_email
            FROM TASK_REMINDERS
            INNER JOIN TASKS ON TASKS.id = TASK_REMINDERS.task_id
            INNER JOIN USERS AS RECIPIENT ON RECIPIENT.id = TASK_REMINDERS.recipient_user_id
            WHERE TASK_REMINDERS.sent_on IS NULL
              AND TASK_REMINDERS.remind_at <= ${now}
            ORDER BY TASK_REMINDERS.remind_at ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getPendingTaskReminders: ${error}`);
            return [];
        });
}

export async function stampTaskReminderSentOn({ id, sent_on }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE TASK_REMINDERS
            SET sent_on = ${sent_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`stampTaskReminderSentOn: ${error}`);
    });
}

export async function deleteTaskReminderById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM TASK_REMINDERS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteTaskReminderById: ${error}`);
        },
    );
}
