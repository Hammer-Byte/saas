import { t } from "elysia";
import { GEM_KEYWORD_TENDER_STAGES } from "../../constants.js";
import {
    bulkChangeGemKeywordTenderStages,
    startGemAdhocTenderScan,
    updateGemKeywordTender,
} from "../../services/gem_keyword_tenders.js";

const gemKeywordTenderStageLiteral = t.Union([
    t.Literal(GEM_KEYWORD_TENDER_STAGES.NEW),
    t.Literal(GEM_KEYWORD_TENDER_STAGES.OUT_OF_SCOPE),
    t.Literal(GEM_KEYWORD_TENDER_STAGES.UNATTENDED),
    t.Literal(GEM_KEYWORD_TENDER_STAGES.MISSED),
    t.Literal(GEM_KEYWORD_TENDER_STAGES.ASSIGNED),
    t.Literal(GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_DOCS),
    t.Literal(GEM_KEYWORD_TENDER_STAGES.PREPARING_DOCS),
    t.Literal(GEM_KEYWORD_TENDER_STAGES.ELIGIBLE),
    t.Literal(GEM_KEYWORD_TENDER_STAGES.NOT_ELIGIBLE),
    t.Literal(GEM_KEYWORD_TENDER_STAGES.FILED),
]);

export default function (app) {
    return app
        .post("/bulk-change-stage", bulkChangeGemKeywordTenderStages, {
            body: t.Object({
                ids: t.Array(t.Numeric({ minimum: 1 }), { minItems: 1 }),
                stage: gemKeywordTenderStageLiteral,
                comment: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["GEM Keyword Tenders"],
                summary: "Change stage for selected GEM keyword tenders (comment required)",
            },
        })
        .post("/adhoc-scan", startGemAdhocTenderScan, {
            body: t.Object({
                query: t.String({ minLength: 1, maxLength: 255 }),
                exact_search: t.Optional(t.Boolean()),
            }),
            detail: {
                tags: ["GEM Keyword Tenders"],
                summary: "Scan GeM for a one-off search query and store matching tenders",
            },
        })
        .patch("/:id", updateGemKeywordTender, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                quote: t.Optional(t.String()),
                stage: t.Optional(gemKeywordTenderStageLiteral),
                assignee_user_id: t.Optional(t.Union([t.Numeric({ minimum: 1 }), t.Null()])),
                assign_to_me: t.Optional(t.Boolean()),
            }),
            detail: {
                tags: ["GEM Keyword Tenders"],
                summary: "Update a GEM keyword tender",
            },
        });
}
