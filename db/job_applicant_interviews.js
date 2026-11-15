import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createJobApplicantInterview({
    job_applicant_id,
    interview_at,
    meeting_link,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO JOB_APPLICANT_INTERVIEWS ${sql(
                { job_applicant_id, interview_at, meeting_link },
                "job_applicant_id",
                "interview_at",
                "meeting_link",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createJobApplicantInterview: ${error}`);
        });
}

export async function updateJobApplicantInterviewOutcomeById({ id, outcome }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE JOB_APPLICANT_INTERVIEWS
            SET outcome = ${outcome}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateJobApplicantInterviewOutcomeById: ${error}`);
    });
}

export async function getJobApplicantInterviewById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM JOB_APPLICANT_INTERVIEWS
            WHERE id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getJobApplicantInterviewById: ${error}`);
            return null;
        });
}

export async function getJobApplicantInterviewsByApplicantId({ job_applicant_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM JOB_APPLICANT_INTERVIEWS
            WHERE job_applicant_id = ${job_applicant_id}
            ORDER BY interview_at DESC, id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getJobApplicantInterviewsByApplicantId: ${error}`);
            return [];
        });
}
