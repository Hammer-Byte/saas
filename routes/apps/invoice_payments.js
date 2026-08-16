import { t } from "elysia";
import {
    addInvoicePayment,
    deleteInvoicePayment,
    updateInvoicePayment,
} from "../../services/invoice_payments.js";

export default function (app) {
    return app
        .post("/", addInvoicePayment, {
            body: t.Object({
                customer_invoice_id: t.Numeric({ minimum: 1 }),
                amount: t.Numeric({ minimum: 0 }),
                note: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["Invoice Payments"],
                summary: "Add invoice payment",
            },
        })
        .patch("/:id", updateInvoicePayment, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                amount: t.Numeric({ minimum: 0 }),
                note: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["Invoice Payments"],
                summary: "Update invoice payment",
            },
        })
        .delete("/:id", deleteInvoicePayment, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Invoice Payments"],
                summary: "Delete invoice payment",
            },
        });
}
