import { t } from "elysia";
import {
    addGemTenderKeyword,
    deleteGemTenderKeyword,
    getGemKeywordTenders,
    getGemTenderKeywords,
    startGemTenderScan,
} from "../../services/gem_tender_keywords.js";

export default function (app) {
    return app
        .get("/", getGemTenderKeywords, {
            detail: {
                tags: ["Gem Tender Keywords"],
                summary: "List GEM tender keywords",
            },
        })
        .post("/", addGemTenderKeyword, {
            body: t.Object({
                keyword: t.String({
                    minLength: 1,
                    maxLength: 255,
                    error: "Keyword is required",
                }),
            }),
            detail: {
                tags: ["Gem Tender Keywords"],
                summary: "Create GEM tender keyword",
            },
        })
        .post("/scan", startGemTenderScan, {
            detail: {
                tags: ["Gem Tender Keywords"],
                summary: "Start GEM tender scan for all keywords",
            },
        })
        .delete("/:id", deleteGemTenderKeyword, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Gem Tender Keywords"],
                summary: "Delete GEM tender keyword",
            },
        })
        .get("/:id/tenders", getGemKeywordTenders, {
            params: t.Object({
                id: t.Numeric(),
            }),
            query: t.Object({
                month: t.Optional(
                    t.String({
                        pattern: "^\\d{4}-\\d{2}$",
                    }),
                ),
            }),
            detail: {
                tags: ["Gem Tender Keywords"],
                summary: "List tenders for a GEM keyword filtered by end month",
            },
        });
}
