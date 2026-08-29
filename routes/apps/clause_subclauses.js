import { t } from "elysia";
import {
    addClauseSubclause,
    deleteClauseSubclause,
    updateClauseSubclause,
    updateClauseSubclauseViewIndex,
} from "../../services/clause_subclauses.js";

export default function (app) {
    return app
        .post("/", addClauseSubclause, {
            body: t.Object({
                clause_id: t.Numeric({ minimum: 1 }),
                body: t.String({
                    minLength: 1,
                    error: "Body is required",
                }),
            }),
            detail: {
                tags: ["Clause Subclauses"],
                summary: "Add clause subclause",
            },
        })
        .patch("/:id/view-index", updateClauseSubclauseViewIndex, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                direction: t.Union([t.Literal("up"), t.Literal("down")]),
            }),
            detail: {
                tags: ["Clause Subclauses"],
                summary: "Move clause subclause up or down",
            },
        })
        .patch("/:id", updateClauseSubclause, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                body: t.String({
                    minLength: 1,
                    error: "Body is required",
                }),
            }),
            detail: {
                tags: ["Clause Subclauses"],
                summary: "Update clause subclause",
            },
        })
        .delete("/:id", deleteClauseSubclause, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Clause Subclauses"],
                summary: "Delete clause subclause",
            },
        });
}
