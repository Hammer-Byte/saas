import { join } from "node:path";
import { filer, logger } from "@hammerbyte/utils";
import { createMedia, getMediaById } from "../db/media.js";
import {
    createJobApplicant,
    getJobApplicantById,
    getJobApplicantByJobPositionIdAndEmail,
    getJobApplicantByJobPositionIdAndPhone,
    updateJobApplicantDecisionById,
    updateJobApplicantInterviewById,
    updateJobApplicantOutcomeById,
    updateJobApplicantShortlistedById,
} from "../db/job_applicants.js";
import { getJobPositionById } from "../db/job_positions.js";
import { getWritableDate } from "../libs/date.js";
import transporter from "../libs/transporter.js";
import { canUseJobs } from "./jobs.js";
import { getCurrentUser } from "./authentication.js";

const RESUME_MAX_BYTES = 15 * 1024 * 1024;
const DECISION_VALUES = new Set(["selected", "rejected"]);

async function requireJobsUser({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized", currentUser: null };
    }
    if (!canUseJobs(currentUser)) {
        set.status = 403;
        return { error: "You do not have access to Jobs", currentUser };
    }
    return { currentUser };
}

export function normalizeApplicantPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) {
        return digits.slice(2);
    }
    if (digits.length === 11 && digits.startsWith("0")) {
        return digits.slice(1);
    }
    return digits;
}

function isValidIndianMobile(phone) {
    return /^[6-9]\d{9}$/.test(phone);
}

function isPdfUpload(uploadedFile) {
    const name = String(uploadedFile?.name || "").toLowerCase();
    const type = String(uploadedFile?.type || "").toLowerCase();
    return name.endsWith(".pdf") || type === "application/pdf";
}

async function storeResumeFile(uploadedFile) {
    const name = String(uploadedFile.name || "resume.pdf").slice(0, 64);
    const extension = filer.getExtensionByFileName(name) || "pdf";
    const file = `${filer.generateRandomFileName()}.${extension}`;
    await Bun.write(join(Bun.env.DIRECTORY_MEDIA, file), uploadedFile);
    return { name, file };
}

function sendShortlistEmail({ applicant, jobTitle }) {
    try {
        const html = filer.prepareTemplated("templates/job-shortlisted.html", {
            full_name: applicant.full_name,
            job_title: jobTitle,
            app_name: "HammerByte",
        });
        transporter.transport({
            recipient: applicant.email,
            subject: `You were shortlisted for ${jobTitle}`,
            body: html,
            html_enabled: true,
        });
    } catch (error) {
        logger.error(`sendShortlistEmail: ${error}`);
    }
}

function sendInterviewEmail({ applicant, jobTitle, interviewAt, meetingLink }) {
    try {
        const interviewDate =
            getWritableDate("DD/MM/YYYY", interviewAt) || String(interviewAt);
        const interviewTime =
            getWritableDate("HH:mm", interviewAt) || String(interviewAt);
        const html = filer.prepareTemplated("templates/job-interview.html", {
            full_name: applicant.full_name,
            job_title: jobTitle,
            interview_date: interviewDate,
            interview_time: interviewTime,
            meeting_link: meetingLink,
            app_name: "HammerByte",
        });
        transporter.transport({
            recipient: applicant.email,
            subject: `Interview scheduled for ${jobTitle}`,
            body: html,
            html_enabled: true,
        });
    } catch (error) {
        logger.error(`sendInterviewEmail: ${error}`);
    }
}

export async function addJobApplication({ body, set }) {
    const jobPosition = await getJobPositionById({ id: body.job_position_id });
    if (!jobPosition || !jobPosition.active) {
        set.status = 404;
        return { error: "Job opening not found" };
    }

    const uploadedFile = body.resume;
    if (!uploadedFile) {
        set.status = 400;
        return { error: "Resume is required" };
    }
    if (!isPdfUpload(uploadedFile)) {
        set.status = 400;
        return { error: "Resume must be a PDF" };
    }
    if (Number(uploadedFile.size || 0) > RESUME_MAX_BYTES) {
        set.status = 400;
        return { error: "Resume must be 15 MB or smaller" };
    }

    const fullName = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = normalizeApplicantPhone(body.phone);
    const state = String(body.state || "").trim();
    const city = String(body.city || "").trim();

    if (!fullName || !email || !state || !city) {
        set.status = 400;
        return { error: "All fields are required" };
    }
    if (!isValidIndianMobile(phone)) {
        set.status = 400;
        return { error: "Enter a valid 10-digit Indian mobile number" };
    }

    const existingByEmail = await getJobApplicantByJobPositionIdAndEmail({
        job_position_id: jobPosition.id,
        email,
    });
    if (existingByEmail) {
        set.status = 409;
        return { error: "You have already applied to this job with this email" };
    }

    const existingByPhone = await getJobApplicantByJobPositionIdAndPhone({
        job_position_id: jobPosition.id,
        phone,
    });
    if (existingByPhone) {
        set.status = 409;
        return { error: "You have already applied to this job with this phone number" };
    }

    const { name, file } = await storeResumeFile(uploadedFile);
    const mediaId = await createMedia({ name, file });
    if (!mediaId) {
        set.status = 400;
        return { error: "Failed to store resume" };
    }

    const applicantId = await createJobApplicant({
        job_position_id: jobPosition.id,
        full_name: fullName,
        phone,
        email,
        state,
        city,
        country: "India",
        cv: mediaId,
    });
    if (!applicantId) {
        set.status = 400;
        return { error: "Failed to submit application" };
    }

    set.status = 201;
    return { message: "Application submitted", id: applicantId };
}

export async function shortlistJobApplications({ body, cookie, set }) {
    const gate = await requireJobsUser({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    let shortlistedCount = 0;
    for (const id of body.ids) {
        const applicant = await getJobApplicantById({ id });
        if (!applicant) {
            continue;
        }
        if (applicant.shortlisted) {
            continue;
        }

        await updateJobApplicantShortlistedById({ id: applicant.id, shortlisted: true });
        shortlistedCount += 1;
        sendShortlistEmail({
            applicant,
            jobTitle: applicant.job_title,
        });
    }

    set.status = 200;
    return { message: "Applicants shortlisted", shortlisted: shortlistedCount };
}

export async function scheduleJobApplicationInterview({ body, cookie, set }) {
    const gate = await requireJobsUser({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    const applicant = await getJobApplicantById({ id: body.id });
    if (!applicant) {
        set.status = 404;
        return { error: "Application not found" };
    }
    if (!applicant.shortlisted) {
        set.status = 400;
        return { error: "Only shortlisted applicants can be invited to interview" };
    }

    const interviewAt = getWritableDate("YYYY-MM-DD HH:mm:ss", body.interview_at);
    if (!interviewAt) {
        set.status = 400;
        return { error: "Valid interview date and time are required" };
    }

    const meetingLink = String(body.meeting_link || "").trim();
    if (!meetingLink) {
        set.status = 400;
        return { error: "Meeting link is required" };
    }

    await updateJobApplicantInterviewById({
        id: applicant.id,
        interview_at: interviewAt,
        interview_meeting_link: meetingLink.slice(0, 512),
    });

    sendInterviewEmail({
        applicant,
        jobTitle: applicant.job_title,
        interviewAt,
        meetingLink,
    });

    const updatedApplicant = await getJobApplicantById({ id: applicant.id });
    set.status = 200;
    return { message: "Interview invite sent", applicant: updatedApplicant };
}

export async function updateJobApplication({ body, cookie, set }) {
    const gate = await requireJobsUser({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    const applicant = await getJobApplicantById({ id: body.id });
    if (!applicant) {
        set.status = 404;
        return { error: "Application not found" };
    }

    if (body.interview_outcome !== undefined) {
        const interviewOutcome =
            body.interview_outcome == null
                ? null
                : String(body.interview_outcome).trim() || null;
        await updateJobApplicantOutcomeById({
            id: applicant.id,
            interview_outcome: interviewOutcome,
        });
    }

    if (body.decision !== undefined) {
        let decision = body.decision;
        if (decision === null || decision === "") {
            decision = null;
        } else {
            decision = String(decision).trim().toLowerCase();
            if (!DECISION_VALUES.has(decision)) {
                set.status = 400;
                return { error: "Decision must be selected or rejected" };
            }
        }
        await updateJobApplicantDecisionById({
            id: applicant.id,
            decision,
        });
    }

    const updatedApplicant = await getJobApplicantById({ id: applicant.id });
    set.status = 200;
    return { message: "Application updated", applicant: updatedApplicant };
}

export async function getJobApplicationResume({ params, cookie, set }) {
    const gate = await requireJobsUser({ cookie, set });
    if (gate.error) {
        return { error: gate.error };
    }

    const applicant = await getJobApplicantById({ id: params.id });
    if (!applicant) {
        set.status = 404;
        return { error: "Application not found" };
    }

    const media = await getMediaById({ id: applicant.cv });
    if (!media) {
        set.status = 404;
        return { error: "Resume not found" };
    }

    const diskFile = Bun.file(join(Bun.env.DIRECTORY_MEDIA, media.file));
    if (!(await diskFile.exists())) {
        set.status = 404;
        return { error: "Resume file not found" };
    }

    set.headers["Content-Disposition"] =
        `inline; filename="${media.name.replace(/"/g, "")}"`;
    set.headers["Content-Type"] =
        filer.getContentTypeByFileName(media.file) || "application/pdf";

    return diskFile;
}
