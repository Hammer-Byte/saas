import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createJobApplicantInterview({
    job_applicant_id,
    interviewer_user_id,
    interview_at,
    meeting_link,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO JOB_APPLICANT_INTERVIEWS ${sql(
                {
                    job_applicant_id,
                    interviewer_user_id,
                    interview_at,
                    meeting_link,
                },
                "job_applicant_id",
                "interviewer_user_id",
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

export async function stampJobApplicantInterviewReminderSentOn({ id, sent_on }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE JOB_APPLICANT_INTERVIEWS
            SET reminder_sent_on = ${sent_on}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`stampJobApplicantInterviewReminderSentOn: ${error}`);
    });
}

export async function getPendingJobApplicantInterviewReminders({ now }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                JOB_APPLICANT_INTERVIEWS.id,
                JOB_APPLICANT_INTERVIEWS.interview_at,
                JOB_APPLICANT_INTERVIEWS.meeting_link,
                JOB_APPLICANTS.full_name AS candidate_name,
                JOB_APPLICANTS.email AS candidate_email,
                JOB_APPLICANTS.phone AS candidate_phone,
                JOB_POSITIONS.title AS job_title,
                USERS.full_name AS interviewer_name,
                USERS.email AS interviewer_email,
                USERS.personal_email AS interviewer_personal_email
            FROM JOB_APPLICANT_INTERVIEWS
            INNER JOIN JOB_APPLICANTS
                ON JOB_APPLICANTS.id = JOB_APPLICANT_INTERVIEWS.job_applicant_id
            INNER JOIN JOB_POSITIONS
                ON JOB_POSITIONS.id = JOB_APPLICANTS.job_position_id
            INNER JOIN USERS
                ON USERS.id = JOB_APPLICANT_INTERVIEWS.interviewer_user_id
            WHERE JOB_APPLICANT_INTERVIEWS.reminder_sent_on IS NULL
              AND JOB_APPLICANT_INTERVIEWS.interview_at > ${now}
              AND JOB_APPLICANT_INTERVIEWS.interview_at <= DATE_ADD(${now}, INTERVAL 10 MINUTE)
            ORDER BY JOB_APPLICANT_INTERVIEWS.interview_at ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getPendingJobApplicantInterviewReminders: ${error}`);
            return [];
        });
}

export async function getJobApplicantInterviewById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                JOB_APPLICANT_INTERVIEWS.*,
                USERS.full_name AS interviewer_name,
                USERS.email AS interviewer_email
            FROM JOB_APPLICANT_INTERVIEWS
            INNER JOIN USERS ON USERS.id = JOB_APPLICANT_INTERVIEWS.interviewer_user_id
            WHERE JOB_APPLICANT_INTERVIEWS.id = ${id}
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
            SELECT
                JOB_APPLICANT_INTERVIEWS.*,
                USERS.full_name AS interviewer_name,
                USERS.email AS interviewer_email
            FROM JOB_APPLICANT_INTERVIEWS
            INNER JOIN USERS ON USERS.id = JOB_APPLICANT_INTERVIEWS.interviewer_user_id
            WHERE JOB_APPLICANT_INTERVIEWS.job_applicant_id = ${job_applicant_id}
            ORDER BY JOB_APPLICANT_INTERVIEWS.interview_at DESC, JOB_APPLICANT_INTERVIEWS.id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getJobApplicantInterviewsByApplicantId: ${error}`);
            return [];
        });
}
