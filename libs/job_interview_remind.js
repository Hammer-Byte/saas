import { filer, logger } from "@hammerbyte/utils";
import {
    getPendingJobApplicantInterviewReminders,
    stampJobApplicantInterviewReminderSentOn,
} from "../db/job_applicant_interviews.js";
import { getIstDateTime, getWritableDate } from "./date.js";
import transporter from "./transporter.js";

const CHECK_INTERVAL_MS = 60 * 1000;

function formatInterviewParts(interviewAt) {
    return {
        interviewDate: getWritableDate("DD/MM/YYYY", interviewAt) || String(interviewAt),
        interviewTime: getWritableDate("HH:mm", interviewAt) || String(interviewAt),
    };
}

function sendApplicantReminder({ interview }) {
    const recipient = String(interview.candidate_email || "").trim();
    if (!recipient) {
        logger.info(
            `interview reminder skipped — no applicant email (interview #${interview.id})`,
        );
        return false;
    }

    const { interviewDate, interviewTime } = formatInterviewParts(interview.interview_at);
    const html = filer.prepareTemplated(
        "templates/job-interview-reminder-applicant.html",
        {
            full_name: interview.candidate_name || "there",
            job_title: interview.job_title || "—",
            interview_date: interviewDate,
            interview_time: interviewTime,
            meeting_link: interview.meeting_link || "",
            app_name: "HammerByte",
        },
    );

    transporter.transport({
        recipient,
        subject: `Interview reminder — ${interview.job_title || "upcoming interview"}`,
        body: html,
        html_enabled: true,
    });
    return true;
}

function sendInterviewerReminder({ interview }) {
    const recipient = String(
        interview.interviewer_personal_email || interview.interviewer_email || "",
    ).trim();
    if (!recipient) {
        logger.info(
            `interview reminder skipped — no interviewer email (interview #${interview.id})`,
        );
        return false;
    }

    const { interviewDate, interviewTime } = formatInterviewParts(interview.interview_at);
    const html = filer.prepareTemplated(
        "templates/job-interview-reminder-interviewer.html",
        {
            interviewer_name:
                interview.interviewer_name || interview.interviewer_email || "there",
            candidate_name: interview.candidate_name || "—",
            candidate_email: interview.candidate_email || "—",
            candidate_phone: interview.candidate_phone || "—",
            job_title: interview.job_title || "—",
            interview_date: interviewDate,
            interview_time: interviewTime,
            meeting_link: interview.meeting_link || "",
            app_name: "HammerByte",
        },
    );

    transporter.transport({
        recipient,
        subject: `Interview reminder — ${interview.candidate_name || "candidate"} for ${interview.job_title || "role"}`,
        body: html,
        html_enabled: true,
    });
    return true;
}

export async function checkJobInterviewReminders() {
    try {
        const now = getIstDateTime();
        if (!now) {
            return;
        }

        const pending = await getPendingJobApplicantInterviewReminders({ now });
        if (!pending.length) {
            return;
        }

        for (const interview of pending) {
            const applicantSent = sendApplicantReminder({ interview });
            const interviewerSent = sendInterviewerReminder({ interview });
            if (!applicantSent && !interviewerSent) {
                continue;
            }
            await stampJobApplicantInterviewReminderSentOn({
                id: interview.id,
                sent_on: now,
            });
            logger.info(
                `interview reminder stamped for interview #${interview.id}`,
            );
        }
    } catch (error) {
        logger.error(`checkJobInterviewReminders: ${error}`);
    }
}

export function startJobInterviewReminderWatcher() {
    checkJobInterviewReminders().catch((error) => {
        logger.error(`startJobInterviewReminderWatcher initial: ${error}`);
    });
    setInterval(() => {
        checkJobInterviewReminders().catch((error) => {
            logger.error(`startJobInterviewReminderWatcher tick: ${error}`);
        });
    }, CHECK_INTERVAL_MS);
}
