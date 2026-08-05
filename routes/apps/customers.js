import { t } from "elysia";
import { addCustomer, deleteCustomer, updateCustomer } from "../../services/customers.js";
import {
    addCustomerProject,
    deleteCustomerProject,
    updateCustomerProject,
} from "../../services/customer_projects.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/", addCustomer, {
            body: t.Object({
                full_name: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: ERRORS.FULL_NAME_REQUIRED,
                }),
                company: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Company is required",
                }),
                pan_gst: t.Optional(t.String({ maxLength: 32 })),
                hsn: t.Optional(t.String({ maxLength: 16 })),
                address: t.String({
                    minLength: 1,
                    maxLength: 512,
                    error: "Address is required",
                }),
            }),
            detail: {
                tags: ["Customers"],
                summary: "Create customer",
            },
        })
        .patch("/", updateCustomer, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                full_name: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: ERRORS.FULL_NAME_REQUIRED,
                }),
                company: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Company is required",
                }),
                pan_gst: t.Optional(t.String({ maxLength: 32 })),
                hsn: t.Optional(t.String({ maxLength: 16 })),
                address: t.String({
                    minLength: 1,
                    maxLength: 512,
                    error: "Address is required",
                }),
            }),
            detail: {
                tags: ["Customers"],
                summary: "Update customer",
            },
        })
        .delete("/:id", deleteCustomer, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Customers"],
                summary: "Delete customer",
            },
        })
        .post("/:id/projects", addCustomerProject, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
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
        .patch("/:id/projects", updateCustomerProject, {
            params: t.Object({
                id: t.Numeric(),
            }),
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
        .delete("/:id/projects/:customer_project_id", deleteCustomerProject, {
            params: t.Object({
                id: t.Numeric(),
                customer_project_id: t.Numeric(),
            }),
            detail: {
                tags: ["Customer Projects"],
                summary: "Delete customer project",
            },
        });
}
