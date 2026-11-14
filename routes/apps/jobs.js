import { t } from "elysia";
import { addJob, deleteJob, updateJob } from "../../services/jobs.js";

export default function (app) {
    return app
        .post("/", addJob, {
            body: t.Object({
                title: t.String({ minLength: 1, maxLength: 128 }),
                description: t.String({ minLength: 1 }),
                experience: t.String({ minLength: 1, maxLength: 128 }),
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
                active: t.Boolean(),
            }),
            detail: {
                tags: ["Jobs"],
                summary: "Update a job opening",
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
