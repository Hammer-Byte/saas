import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createTask({
    title,
    description = null,
    expected_hours = null,
    actual_hours = null,
    start_at = null,
    end_at = null,
    completed_on = null,
    state,
    priority,
    blocked_reason = null,
    project_id = null,
    assignee_user_id = null,
    reviewer_user_id = null,
    created_by_user_id,
    sprint_week_start = null,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO TASKS ${sql(
                {
                    title,
                    description,
                    expected_hours,
                    actual_hours,
                    start_at,
                    end_at,
                    completed_on,
                    state,
                    priority,
                    blocked_reason,
                    project_id,
                    assignee_user_id,
                    reviewer_user_id,
                    created_by_user_id,
                    sprint_week_start,
                },
                "title",
                "description",
                "expected_hours",
                "actual_hours",
                "start_at",
                "end_at",
                "completed_on",
                "state",
                "priority",
                "blocked_reason",
                "project_id",
                "assignee_user_id",
                "reviewer_user_id",
                "created_by_user_id",
                "sprint_week_start",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createTask: ${error}`);
        });
}

export async function getTaskById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASKS.*,
                ASSIGNEE.full_name AS assignee_full_name,
                ASSIGNEE.email AS assignee_email,
                ASSIGNEE.personal_email AS assignee_personal_email,
                REVIEWER.full_name AS reviewer_full_name,
                REVIEWER.email AS reviewer_email,
                REVIEWER.personal_email AS reviewer_personal_email,
                CREATOR.full_name AS created_by_full_name,
                CREATOR.email AS created_by_email,
                CUSTOMER_PROJECTS.title AS project_title,
                CUSTOMERS.full_name AS customer_full_name
            FROM TASKS
            LEFT JOIN USERS AS ASSIGNEE ON ASSIGNEE.id = TASKS.assignee_user_id
            LEFT JOIN USERS AS REVIEWER ON REVIEWER.id = TASKS.reviewer_user_id
            INNER JOIN USERS AS CREATOR ON CREATOR.id = TASKS.created_by_user_id
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = TASKS.project_id
            LEFT JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_PROJECTS.customer_id
            WHERE TASKS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getTaskById: ${error}`);
            return null;
        });
}

export async function getAllTasks() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASKS.*,
                ASSIGNEE.full_name AS assignee_full_name,
                ASSIGNEE.email AS assignee_email,
                ASSIGNEE.personal_email AS assignee_personal_email,
                REVIEWER.full_name AS reviewer_full_name,
                REVIEWER.email AS reviewer_email,
                REVIEWER.personal_email AS reviewer_personal_email,
                CREATOR.full_name AS created_by_full_name,
                CREATOR.email AS created_by_email,
                CUSTOMER_PROJECTS.title AS project_title,
                CUSTOMERS.full_name AS customer_full_name
            FROM TASKS
            LEFT JOIN USERS AS ASSIGNEE ON ASSIGNEE.id = TASKS.assignee_user_id
            LEFT JOIN USERS AS REVIEWER ON REVIEWER.id = TASKS.reviewer_user_id
            INNER JOIN USERS AS CREATOR ON CREATOR.id = TASKS.created_by_user_id
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = TASKS.project_id
            LEFT JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_PROJECTS.customer_id
            ORDER BY
                CASE TASKS.priority
                    WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2
                    ELSE 3
                END ASC,
                TASKS.end_at IS NULL ASC,
                TASKS.end_at ASC,
                TASKS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllTasks: ${error}`);
            return [];
        });
}

export async function getTasksByProjectId({ project_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASKS.*,
                ASSIGNEE.full_name AS assignee_full_name,
                ASSIGNEE.email AS assignee_email,
                ASSIGNEE.personal_email AS assignee_personal_email,
                REVIEWER.full_name AS reviewer_full_name,
                REVIEWER.email AS reviewer_email,
                REVIEWER.personal_email AS reviewer_personal_email,
                CREATOR.full_name AS created_by_full_name,
                CREATOR.email AS created_by_email,
                CUSTOMER_PROJECTS.title AS project_title,
                CUSTOMERS.full_name AS customer_full_name
            FROM TASKS
            LEFT JOIN USERS AS ASSIGNEE ON ASSIGNEE.id = TASKS.assignee_user_id
            LEFT JOIN USERS AS REVIEWER ON REVIEWER.id = TASKS.reviewer_user_id
            INNER JOIN USERS AS CREATOR ON CREATOR.id = TASKS.created_by_user_id
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = TASKS.project_id
            LEFT JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_PROJECTS.customer_id
            WHERE TASKS.project_id = ${project_id}
            ORDER BY TASKS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getTasksByProjectId: ${error}`);
            return [];
        });
}

export async function getTasksBySprintWeekStart({ sprint_week_start }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASKS.*,
                ASSIGNEE.full_name AS assignee_full_name,
                ASSIGNEE.email AS assignee_email,
                ASSIGNEE.personal_email AS assignee_personal_email,
                REVIEWER.full_name AS reviewer_full_name,
                REVIEWER.email AS reviewer_email,
                CREATOR.full_name AS created_by_full_name,
                CREATOR.email AS created_by_email,
                CUSTOMER_PROJECTS.title AS project_title,
                CUSTOMERS.full_name AS customer_full_name
            FROM TASKS
            LEFT JOIN USERS AS ASSIGNEE ON ASSIGNEE.id = TASKS.assignee_user_id
            LEFT JOIN USERS AS REVIEWER ON REVIEWER.id = TASKS.reviewer_user_id
            INNER JOIN USERS AS CREATOR ON CREATOR.id = TASKS.created_by_user_id
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = TASKS.project_id
            LEFT JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_PROJECTS.customer_id
            WHERE TASKS.sprint_week_start = ${sprint_week_start}
            ORDER BY ASSIGNEE.full_name ASC, TASKS.id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getTasksBySprintWeekStart: ${error}`);
            return [];
        });
}

export async function updateTaskById({
    id,
    title,
    description = null,
    expected_hours = null,
    actual_hours = null,
    start_at = null,
    end_at = null,
    completed_on = null,
    state,
    priority,
    blocked_reason = null,
    project_id = null,
    assignee_user_id = null,
    reviewer_user_id = null,
    sprint_week_start = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE TASKS
            SET
                title = ${title},
                description = ${description},
                expected_hours = ${expected_hours},
                actual_hours = ${actual_hours},
                start_at = ${start_at},
                end_at = ${end_at},
                completed_on = ${completed_on},
                state = ${state},
                priority = ${priority},
                blocked_reason = ${blocked_reason},
                project_id = ${project_id},
                assignee_user_id = ${assignee_user_id},
                reviewer_user_id = ${reviewer_user_id},
                sprint_week_start = ${sprint_week_start}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateTaskById: ${error}`);
    });
}

export async function updateTaskStateById({
    id,
    state,
    completed_on = null,
    blocked_reason = null,
    assignee_user_id = null,
    reviewer_user_id = null,
    sprint_week_start = null,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE TASKS
            SET
                state = ${state},
                completed_on = ${completed_on},
                blocked_reason = ${blocked_reason},
                assignee_user_id = ${assignee_user_id},
                reviewer_user_id = ${reviewer_user_id},
                sprint_week_start = ${sprint_week_start}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateTaskStateById: ${error}`);
    });
}

export async function deleteTaskById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM TASKS WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteTaskById: ${error}`);
    });
}
