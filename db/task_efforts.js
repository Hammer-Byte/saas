import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createTaskEffort({
    task_id,
    user_id,
    hours,
    hourly_rate,
    charge,
    note = null,
    created_by_user_id,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO TASK_EFFORTS ${sql(
                {
                    task_id,
                    user_id,
                    hours,
                    hourly_rate,
                    charge,
                    note,
                    created_by_user_id,
                },
                "task_id",
                "user_id",
                "hours",
                "hourly_rate",
                "charge",
                "note",
                "created_by_user_id",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createTaskEffort: ${error}`);
        });
}

export async function getTaskEffortsByTaskId({ task_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                TASK_EFFORTS.*,
                USERS.full_name AS user_full_name,
                USERS.email AS user_email,
                CREATOR.full_name AS created_by_full_name
            FROM TASK_EFFORTS
            INNER JOIN USERS ON USERS.id = TASK_EFFORTS.user_id
            INNER JOIN USERS AS CREATOR ON CREATOR.id = TASK_EFFORTS.created_by_user_id
            WHERE TASK_EFFORTS.task_id = ${task_id}
            ORDER BY TASK_EFFORTS.id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getTaskEffortsByTaskId: ${error}`);
            return [];
        });
}

export async function getTaskEffortsChargeTotalByTaskId({ task_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                COALESCE(SUM(hours), 0) AS hours_total,
                COALESCE(SUM(charge), 0) AS charge_total
            FROM TASK_EFFORTS
            WHERE task_id = ${task_id}
        `,
    )
        .then((result) => ({
            hours_total: Number(result?.[0]?.hours_total ?? 0),
            charge_total: Number(result?.[0]?.charge_total ?? 0),
        }))
        .catch((error) => {
            logger.error(`getTaskEffortsChargeTotalByTaskId: ${error}`);
            return { hours_total: 0, charge_total: 0 };
        });
}
