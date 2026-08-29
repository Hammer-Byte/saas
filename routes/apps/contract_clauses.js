import { t } from "elysia";
import {
    addContractClause,
    deleteContractClause,
    updateContractClause,
    updateContractClauseViewIndex,
} from "../../services/contract_clauses.js";

export default function (app) {
    return app
        .post("/", addContractClause, {
            body: t.Object({
                external_contract_id: t.Numeric({ minimum: 1 }),
                title: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Title is required",
                }),
            }),
            detail: {
                tags: ["Contract Clauses"],
                summary: "Add contract clause",
            },
        })
        .patch("/:id/view-index", updateContractClauseViewIndex, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                direction: t.Union([t.Literal("up"), t.Literal("down")]),
            }),
            detail: {
                tags: ["Contract Clauses"],
                summary: "Move contract clause up or down",
            },
        })
        .patch("/:id", updateContractClause, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Title is required",
                }),
            }),
            detail: {
                tags: ["Contract Clauses"],
                summary: "Update contract clause",
            },
        })
        .delete("/:id", deleteContractClause, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Contract Clauses"],
                summary: "Delete contract clause",
            },
        });
}
