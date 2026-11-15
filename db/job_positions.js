import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createJobPosition({
    title,
    description,
    experience,
    reply_email,
    active = null,
}) {
    const values = { title, description, experience, reply_email };
    const columns = ["title", "description", "experience", "reply_email"];
    if (active != null) {
        values.active = active;
        columns.push("active");
    }

    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO JOB_POSITIONS ${sql(values, ...columns)}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createJobPosition: ${error}`);
        });
}

export async function updateJobPositionById({
    id,
    title,
    description,
    experience,
    reply_email,
    active,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE JOB_POSITIONS
            SET
                title = ${title},
                description = ${description},
                experience = ${experience},
                reply_email = ${reply_email},
                active = ${active}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateJobPositionById: ${error}`);
    });
}

export async function deleteJobPositionById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM JOB_POSITIONS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteJobPositionById: ${error}`);
        },
    );
}

export async function getJobPositionById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM JOB_POSITIONS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getJobPositionById: ${error}`);
            return null;
        });
}

export async function getAllJobPositions() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                JOB_POSITIONS.*,
                (
                    SELECT COUNT(*)
                    FROM JOB_APPLICANTS
                    WHERE JOB_APPLICANTS.job_position_id = JOB_POSITIONS.id
                ) AS application_count
            FROM JOB_POSITIONS
            ORDER BY JOB_POSITIONS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllJobPositions: ${error}`);
            return [];
        });
}

export async function getActiveJobPositions() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM JOB_POSITIONS
            WHERE active = TRUE
            ORDER BY created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getActiveJobPositions: ${error}`);
            return [];
        });
}
