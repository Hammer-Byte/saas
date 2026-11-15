import { t } from "elysia";
import { updateJobApplicantInterview } from "../../services/job_applications.js";

export default function (app) {
    return app.patch("/", updateJobApplicantInterview, {
        body: t.Object({
            id: t.Numeric({ minimum: 1 }),
            outcome: t.Optional(t.Union([t.String({ maxLength: 65535 }), t.Null()])),
        }),
        detail: {
            tags: ["Job Applicant Interviews"],
            summary: "Update interview outcome notes",
        },
    });
}
