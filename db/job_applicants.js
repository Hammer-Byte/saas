import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createJobApplicant({
    job_position_id,
    full_name,
    phone,
    email,
    state,
    city,
    country = null,
    cv,
}) {
    const values = {
        job_position_id,
        full_name,
        phone,
        email,
        state,
        city,
        cv,
    };
    const columns = [
        "job_position_id",
        "full_name",
        "phone",
        "email",
        "state",
        "city",
        "cv",
    ];
    if (country != null) {
        values.country = country;
        columns.push("country");
    }

    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO JOB_APPLICANTS ${sql(values, ...columns)}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createJobApplicant: ${error}`);
        });
}

export async function updateJobApplicantShortlistedById({ id, shortlisted }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE JOB_APPLICANTS
            SET shortlisted = ${shortlisted}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateJobApplicantShortlistedById: ${error}`);
    });
}

export async function updateJobApplicantDecisionById({ id, decision }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE JOB_APPLICANTS
            SET decision = ${decision}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateJobApplicantDecisionById: ${error}`);
    });
}

export async function getJobApplicantById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                JOB_APPLICANTS.*,
                MEDIA.name AS cv_name,
                MEDIA.file AS cv_file,
                JOB_POSITIONS.title AS job_title,
                JOB_POSITIONS.reply_email AS job_reply_email
            FROM JOB_APPLICANTS
            INNER JOIN MEDIA ON MEDIA.id = JOB_APPLICANTS.cv
            INNER JOIN JOB_POSITIONS ON JOB_POSITIONS.id = JOB_APPLICANTS.job_position_id
            WHERE JOB_APPLICANTS.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getJobApplicantById: ${error}`);
            return null;
        });
}

export async function getJobApplicantByMediaId({ media_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM JOB_APPLICANTS
            WHERE cv = ${media_id}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getJobApplicantByMediaId: ${error}`);
            return null;
        });
}

export async function getJobApplicantsByJobPositionId({ job_position_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                JOB_APPLICANTS.*,
                MEDIA.name AS cv_name,
                MEDIA.file AS cv_file,
                (
                    SELECT JOB_APPLICANT_INTERVIEWS.interview_at
                    FROM JOB_APPLICANT_INTERVIEWS
                    WHERE JOB_APPLICANT_INTERVIEWS.job_applicant_id = JOB_APPLICANTS.id
                    ORDER BY JOB_APPLICANT_INTERVIEWS.interview_at DESC, JOB_APPLICANT_INTERVIEWS.id DESC
                    LIMIT 1
                ) AS latest_interview_at,
                (
                    SELECT USERS.full_name
                    FROM JOB_APPLICANT_INTERVIEWS
                    INNER JOIN USERS
                        ON USERS.id = JOB_APPLICANT_INTERVIEWS.interviewer_user_id
                    WHERE JOB_APPLICANT_INTERVIEWS.job_applicant_id = JOB_APPLICANTS.id
                    ORDER BY JOB_APPLICANT_INTERVIEWS.interview_at DESC, JOB_APPLICANT_INTERVIEWS.id DESC
                    LIMIT 1
                ) AS latest_interviewer_name
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

export async function getJobApplicantByJobPositionIdAndEmail({ job_position_id, email }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM JOB_APPLICANTS
            WHERE job_position_id = ${job_position_id}
              AND email = ${email}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getJobApplicantByJobPositionIdAndEmail: ${error}`);
            return null;
        });
}

export async function getJobApplicantByJobPositionIdAndPhone({ job_position_id, phone }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM JOB_APPLICANTS
            WHERE job_position_id = ${job_position_id}
              AND phone = ${phone}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getJobApplicantByJobPositionIdAndPhone: ${error}`);
            return null;
        });
}

export async function getJobApplicantMediaByJobPositionId({ job_position_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                MEDIA.id AS media_id,
                MEDIA.file AS media_file
            FROM JOB_APPLICANTS
            INNER JOIN MEDIA ON MEDIA.id = JOB_APPLICANTS.cv
            WHERE JOB_APPLICANTS.job_position_id = ${job_position_id}
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getJobApplicantMediaByJobPositionId: ${error}`);
            return [];
        });
}
