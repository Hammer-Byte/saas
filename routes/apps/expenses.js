import { t } from "elysia";
import { addExpense, deleteExpense, updateExpense } from "../../services/expenses.js";

export default function (app) {
    return app
        .post("/", addExpense, {
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Title is required",
                }),
                description: t.Optional(
                    t.Union([t.String({ maxLength: 512 }), t.Literal(""), t.Null()]),
                ),
                amount: t.Numeric({ minimum: 0 }),
                expense_date: t.String({
                    minLength: 10,
                    maxLength: 10,
                    error: "Date is required",
                }),
                loaned: t.Boolean(),
            }),
            detail: {
                tags: ["Expenses"],
                summary: "Create expense",
            },
        })
        .patch("/", updateExpense, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                title: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Title is required",
                }),
                description: t.Optional(
                    t.Union([t.String({ maxLength: 512 }), t.Literal(""), t.Null()]),
                ),
                amount: t.Numeric({ minimum: 0 }),
                expense_date: t.String({
                    minLength: 10,
                    maxLength: 10,
                    error: "Date is required",
                }),
                loaned: t.Boolean(),
            }),
            detail: {
                tags: ["Expenses"],
                summary: "Update expense",
            },
        })
        .delete("/:id", deleteExpense, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Expenses"],
                summary: "Delete expense",
            },
        });
}
