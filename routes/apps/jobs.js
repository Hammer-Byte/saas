import { t } from "elysia";
import { addJob, deleteJob, updateJob, updateJobActive } from "../../services/jobs.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/", addJob, {
            body: t.Object({
                title: t.String({ minLength: 1, maxLength: 128 }),
                description: t.String({ minLength: 1 }),
                experience: t.String({ minLength: 1, maxLength: 128 }),
                reply_email: t.String({
                    format: "email",
                    maxLength: 255,
                    error: ERRORS.EMAIL_INVALID,
                }),
                active: t.Optional(t.Boolean()),
            }),
            detail: {
                tags: ["Jobs"],
                summary: "Create a job opening",
            },
        })
        .patch("/", updateJob, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                title: t.String({ minLength: 1, maxLength: 128 }),
                description: t.String({ minLength: 1 }),
                experience: t.String({ minLength: 1, maxLength: 128 }),
                reply_email: t.String({
                    format: "email",
                    maxLength: 255,
                    error: ERRORS.EMAIL_INVALID,
                }),
                active: t.Boolean(),
            }),
            detail: {
                tags: ["Jobs"],
                summary: "Update a job opening",
            },
        })
        .patch("/active", updateJobActive, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                active: t.Boolean(),
            }),
            detail: {
                tags: ["Jobs"],
                summary: "Toggle whether a job is accepting applications",
            },
        })
        .delete("/:id", deleteJob, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Jobs"],
                summary: "Delete a job opening and its applications",
            },
        });
}
