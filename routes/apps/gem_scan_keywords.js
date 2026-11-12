import { t } from "elysia";
import {
    addGemScanKeyword,
    deleteGemScanKeyword,
    listGemScanKeywords,
    startGemScanKeywordScan,
    updateGemScanKeyword,
} from "../../services/gem_scan_keywords.js";

export default function (app) {
    return app
        .get("/", listGemScanKeywords, {
            detail: {
                tags: ["GEM Scan Keywords"],
                summary: "List Direct Search keywords",
            },
        })
        .post("/scan", startGemScanKeywordScan, {
            body: t.Object({
                keyword_ids: t.Array(t.Numeric({ minimum: 1 }), { minItems: 1 }),
            }),
            detail: {
                tags: ["GEM Scan Keywords"],
                summary: "Start Direct Search (all-bids) scan for selected keywords",
            },
        })
        .post("/", addGemScanKeyword, {
            body: t.Object({
                keyword: t.String({
                    minLength: 1,
                    maxLength: 512,
                    error: "Keyword is required",
                }),
                exact_search: t.Optional(t.Boolean()),
                tender_category_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["GEM Scan Keywords"],
                summary: "Create Direct Search keyword",
            },
        })
        .patch("/:id", updateGemScanKeyword, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            body: t.Object({
                keyword: t.String({
                    minLength: 1,
                    maxLength: 512,
                    error: "Keyword is required",
                }),
                exact_search: t.Optional(t.Boolean()),
                tender_category_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["GEM Scan Keywords"],
                summary: "Update Direct Search keyword",
            },
        })
        .delete("/:id", deleteGemScanKeyword, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["GEM Scan Keywords"],
                summary: "Delete Direct Search keyword",
            },
        });
}
