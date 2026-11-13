import { t } from "elysia";
import {
    GEM_TENDER_ELIGIBILITY_CHOICES,
    GEM_TENDER_FILING_MIN_DOCUMENTS,
    GEM_TENDER_STAGES,
} from "../../constants.js";
import {
    bulkAssignGemTenders,
    bulkChangeGemTenderStages,
    bulkSetGemTenderEligibility,
    listGemTenders,
    startGemAdhocTenderScan,
    updateGemTender,
} from "../../services/gem_tenders.js";
import { fileGemTender } from "../../services/gem_tender_documents.js";

/** Filed is excluded: it goes through POST /:id/file with documents. */
const gemTenderManualStageLiteral = t.Union([
    t.Literal(GEM_TENDER_STAGES.WAITING_FOR_DOCS),
    t.Literal(GEM_TENDER_STAGES.WAITING_FOR_GEM),
    t.Literal(GEM_TENDER_STAGES.WAITING_FOR_QUOTE),
    t.Literal(GEM_TENDER_STAGES.PREPARING_DOCS),
]);

const gemTenderEligibilityLiteral = t.Union([
    t.Literal(GEM_TENDER_ELIGIBILITY_CHOICES.ELIGIBLE),
    t.Literal(GEM_TENDER_ELIGIBILITY_CHOICES.INELIGIBLE),
    t.Literal(GEM_TENDER_ELIGIBILITY_CHOICES.OUT_OF_SCOPE),
]);

export default function (app) {
    return app
        .get("/", listGemTenders, {
            query: t.Object({
                from: t.String({ minLength: 10, maxLength: 10 }),
                to: t.String({ minLength: 10, maxLength: 10 }),
            }),
            detail: {
                tags: ["GEM Tenders"],
                summary: "List GEM tenders in an end-date range",
            },
        })
        .post("/bulk-change-stage", bulkChangeGemTenderStages, {
            body: t.Object({
                ids: t.Array(t.Numeric({ minimum: 1 }), { minItems: 1 }),
                stage: gemTenderManualStageLiteral,
                comment: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["GEM Tenders"],
                summary: "Change stage for selected eligible GEM tenders (comment required)",
            },
        })
        .post("/bulk-eligibility", bulkSetGemTenderEligibility, {
            body: t.Object({
                ids: t.Array(t.Numeric({ minimum: 1 }), { minItems: 1 }),
                eligibility: t.Union([
                    t.Literal(GEM_TENDER_ELIGIBILITY_CHOICES.INELIGIBLE),
                    t.Literal(GEM_TENDER_ELIGIBILITY_CHOICES.OUT_OF_SCOPE),
                ]),
                comment: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["GEM Tenders"],
                summary: "Mark selected GEM tenders not eligible or out of scope (locks them)",
            },
        })
        .post("/bulk-assign", bulkAssignGemTenders, {
            body: t.Object({
                ids: t.Array(t.Numeric({ minimum: 1 }), { minItems: 1 }),
                assignee_user_id: t.Optional(t.Numeric({ minimum: 1 })),
                assign_to_me: t.Optional(t.Boolean()),
                comment: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["GEM Tenders"],
                summary: "Assign selected GEM tenders to one person (single email)",
            },
        })
        .post("/adhoc-scan", startGemAdhocTenderScan, {
            body: t.Object({
                query: t.Optional(t.String({ minLength: 1, maxLength: 20000 })),
                queries: t.Optional(
                    t.Array(t.String({ minLength: 1, maxLength: 255 }), {
                        minItems: 1,
                        maxItems: 50,
                    }),
                ),
                exact_search: t.Optional(t.Boolean()),
            }),
            detail: {
                tags: ["GEM Tenders"],
                summary: "Scan GeM for one or more one-off search queries and store matching tenders",
            },
        })
        .post("/:id/file", fileGemTender, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            body: t.Object({
                files: t.Files({ minItems: GEM_TENDER_FILING_MIN_DOCUMENTS }),
            }),
            detail: {
                tags: ["GEM Tenders"],
                summary: `File a GEM tender with at least ${GEM_TENDER_FILING_MIN_DOCUMENTS} documents (locks it)`,
            },
        })
        .patch("/:id", updateGemTender, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                quote: t.Optional(t.String()),
                stage: t.Optional(gemTenderManualStageLiteral),
                eligibility: t.Optional(gemTenderEligibilityLiteral),
                assignee_user_id: t.Optional(t.Union([t.Numeric({ minimum: 1 }), t.Null()])),
                assign_to_me: t.Optional(t.Boolean()),
                category_group_id: t.Optional(
                    t.Union([t.Numeric({ minimum: 1 }), t.Null()]),
                ),
                tender_category_id: t.Optional(
                    t.Union([t.Numeric({ minimum: 1 }), t.Null()]),
                ),
                locked: t.Optional(t.Literal(false)),
            }),
            detail: {
                tags: ["GEM Tenders"],
                summary: "Update a GEM tender",
            },
        });
}
