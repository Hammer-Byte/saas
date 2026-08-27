import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createJobApplicant({
    job_position_id,
    full_name,
    phone,
    email,
    cv,
}) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO JOB_APPLICANTS ${sql(
                { job_position_id, full_name, phone, email, cv },
                "job_position_id",
                "full_name",
                "phone",
                "email",
                "cv",
            )}
        `,
    ).catch((error) => {
        logger.error(`createJobApplicant: ${error}`);
    });
}

export async function updateJobApplicantById({ id, viewed, selected }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE JOB_APPLICANTS
            SET
                viewed = ${viewed},
                selected = ${selected}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateJobApplicantById: ${error}`);
    });
}

export async function deleteJobApplicantById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM JOB_APPLICANTS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteJobApplicantById: ${error}`);
        },
    );
}

export async function getJobApplicantById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                JOB_APPLICANTS.*,
                MEDIA.name AS cv_name,
                MEDIA.file AS cv_file
            FROM JOB_APPLICANTS
            INNER JOIN MEDIA ON MEDIA.id = JOB_APPLICANTS.cv
            WHERE JOB_APPLICANTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getJobApplicantById: ${error}`);
            return null;
        });
}

export async function getJobApplicantsByJobPositionId({ job_position_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                JOB_APPLICANTS.*,
                MEDIA.name AS cv_name,
                MEDIA.file AS cv_file
            FROM JOB_APPLICANTS
            INNER JOIN MEDIA ON MEDIA.id = JOB_APPLICANTS.cv
            WHERE JOB_APPLICANTS.job_position_id = ${job_position_id}
            ORDER BY JOB_APPLICANTS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getJobApplicantsByJobPositionId: ${error}`);
            return [];
        });
}
