import { t } from "elysia";
import {
    addCustomerInvoice,
    deleteCustomerInvoice,
    updateCustomerInvoice,
} from "../../services/customer_invoices.js";

export default function (app) {
    return app
        .post("/", addCustomerInvoice, {
            body: t.Object({
                customer_id: t.Numeric({ minimum: 1 }),
                project_id: t.Numeric({ minimum: 1 }),
                due_date: t.String({
                    minLength: 10,
                    maxLength: 10,
                    error: "Due date is required",
                }),
                total: t.Optional(t.Numeric({ minimum: 0 })),
                gst: t.Optional(t.Numeric({ minimum: 0 })),
            }),
            detail: {
                tags: ["Customer Invoices"],
                summary: "Create customer invoice",
            },
        })
        .patch("/", updateCustomerInvoice, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                customer_id: t.Numeric({ minimum: 1 }),
                project_id: t.Numeric({ minimum: 1 }),
                due_date: t.String({
                    minLength: 10,
                    maxLength: 10,
                    error: "Due date is required",
                }),
                total: t.Optional(t.Numeric({ minimum: 0 })),
                gst: t.Optional(t.Numeric({ minimum: 0 })),
            }),
            detail: {
                tags: ["Customer Invoices"],
                summary: "Update customer invoice",
            },
        })
        .delete("/:id", deleteCustomerInvoice, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Customer Invoices"],
                summary: "Delete customer invoice",
            },
        });
}
