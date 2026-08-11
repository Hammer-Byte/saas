import { t } from "elysia";
import {
    addInvoiceItem,
    deleteInvoiceItem,
    updateInvoiceItem,
} from "../../services/invoice_items.js";

export default function (app) {
    return app
        .post("/", addInvoiceItem, {
            body: t.Object({
                customer_invoice_id: t.Numeric({ minimum: 1 }),
                item: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Item is required",
                }),
                cost: t.Numeric({ minimum: 0 }),
                quantity: t.Numeric({ exclusiveMinimum: 0 }),
            }),
            detail: {
                tags: ["Invoice Items"],
                summary: "Add invoice item",
            },
        })
        .patch("/:id", updateInvoiceItem, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                item: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Item is required",
                }),
                cost: t.Numeric({ minimum: 0 }),
                quantity: t.Numeric({ exclusiveMinimum: 0 }),
            }),
            detail: {
                tags: ["Invoice Items"],
                summary: "Update invoice item",
            },
        })
        .delete("/:id", deleteInvoiceItem, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Invoice Items"],
                summary: "Delete invoice item",
            },
        });
}
