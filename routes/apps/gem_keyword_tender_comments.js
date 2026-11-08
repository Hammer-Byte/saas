import { t } from "elysia";
import {
    addGemKeywordTenderComment,
    deleteGemKeywordTenderComment,
    updateGemKeywordTenderComment,
} from "../../services/gem_keyword_tender_comments.js";

export default function (app) {
    return app
        .post("/", addGemKeywordTenderComment, {
            body: t.Object({
                gem_keyword_tender_id: t.Numeric({ minimum: 1 }),
                comment: t.String({ minLength: 1 }),
                file: t.Optional(t.File()),
            }),
            detail: {
                tags: ["GEM Keyword Tender Comments"],
                summary: "Add a GEM keyword tender comment (optional attachment)",
            },
        })
        .patch("/:id", updateGemKeywordTenderComment, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                comment: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["GEM Keyword Tender Comments"],
                summary: "Update a GEM keyword tender comment",
            },
        })
        .delete("/:id", deleteGemKeywordTenderComment, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["GEM Keyword Tender Comments"],
                summary: "Delete a GEM keyword tender comment",
            },
        });
}
