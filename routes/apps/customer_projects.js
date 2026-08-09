import { t } from "elysia";
import {
    addCustomerProject,
    deleteCustomerProject,
    updateCustomerProject,
} from "../../services/customer_projects.js";

export default function (app) {
    return app
        .post("/", addCustomerProject, {
            body: t.Object({
                customer_id: t.Numeric({ minimum: 1 }),
                title: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Title is required",
                }),
                description: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["Customer Projects"],
                summary: "Add a customer project",
            },
        })
        .patch("/", updateCustomerProject, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                title: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Title is required",
                }),
                description: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["Customer Projects"],
                summary: "Update customer project",
            },
        })
        .delete("/:id", deleteCustomerProject, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Customer Projects"],
                summary: "Delete customer project",
            },
        });
}
