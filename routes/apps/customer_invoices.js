import { t } from "elysia";
import {
    addCustomerInvoice,
    addCustomerInvoiceServiceUsage,
    deleteCustomerInvoice,
    getCustomerInvoicePdf,
    updateCustomerInvoice,
} from "../../services/customer_invoices.js";

export default function (app) {
    return app
        .post("/", addCustomerInvoice, {
            body: t.Object({
                customer_id: t.Numeric({ minimum: 1 }),
                project_id: t.Numeric({ minimum: 1 }),
                date: t.String({
                    pattern: "^\\d{4}-(0[1-9]|1[0-2])$",
                    error: "Invoice month is required",
                }),
                items: t.Array(
                    t.Object({
                        item: t.String({
                            minLength: 1,
                            maxLength: 128,
                            error: "Item is required",
                        }),
                        cost: t.Numeric({ minimum: 0 }),
                        quantity: t.Numeric({ exclusiveMinimum: 0 }),
                    }),
                    { minItems: 1 },
                ),
            }),
            detail: {
                tags: ["Customer Invoices"],
                summary: "Create customer invoice with items",
            },
        })
        .get("/:id/pdf", getCustomerInvoicePdf, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Customer Invoices"],
                summary: "Download customer invoice PDF",
            },
        })
        .post("/:id/service-usage", addCustomerInvoiceServiceUsage, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Customer Invoices"],
                summary: "Fetch service usage for invoice project month",
            },
        })
        .patch("/", updateCustomerInvoice, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                due_date: t.String({
                    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                    error: "Due date is required",
                }),
            }),
            detail: {
                tags: ["Customer Invoices"],
                summary: "Update customer invoice due date",
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
