import { t } from "elysia";
import {
    addJobApplication,
    getJobApplicationResume,
    scheduleJobApplicationInterview,
    shortlistJobApplications,
    updateJobApplication,
} from "../../services/job_applications.js";
import { ERRORS } from "../../constants.js";

export function publicJobApplications(app) {
    return app.post("/", addJobApplication, {
        body: t.Object({
            job_position_id: t.Numeric({ minimum: 1 }),
            full_name: t.String({ minLength: 1, maxLength: 128 }),
            phone: t.String({ minLength: 10, maxLength: 13 }),
            email: t.String({
                format: "email",
                maxLength: 255,
                error: ERRORS.EMAIL_INVALID,
            }),
            state: t.String({ minLength: 1, maxLength: 64 }),
            city: t.String({ minLength: 1, maxLength: 64 }),
            country: t.Optional(t.String({ maxLength: 64 })),
            resume: t.File({ error: ERRORS.FILE_REQUIRED }),
        }),
        detail: {
            tags: ["Job Applications"],
            summary: "Submit a public job application",
        },
    });
}

export default function (app) {
    return app
        .post("/shortlist", shortlistJobApplications, {
            body: t.Object({
                ids: t.Array(t.Numeric({ minimum: 1 }), { minItems: 1 }),
            }),
            detail: {
                tags: ["Job Applications"],
                summary: "Mark applications shortlisted and email applicants",
            },
        })
        .post("/interview", scheduleJobApplicationInterview, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                interviewer_user_id: t.Numeric({ minimum: 1 }),
                interview_at: t.String({ minLength: 1, maxLength: 32 }),
                meeting_link: t.String({ minLength: 1, maxLength: 512 }),
            }),
            detail: {
                tags: ["Job Applications"],
                summary: "Schedule interview and send invite email",
            },
        })
        .patch("/", updateJobApplication, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                decision: t.Union([
                    t.Literal("selected"),
                    t.Literal("rejected"),
                    t.Null(),
                    t.Literal(""),
                ]),
            }),
            detail: {
                tags: ["Job Applications"],
                summary: "Update application decision",
            },
        })
        .get("/:id/resume", getJobApplicationResume, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Job Applications"],
                summary: "Download applicant resume",
            },
        });
}
