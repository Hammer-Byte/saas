import { t } from "elysia";
import {
    addGemKeywordTenderDocument,
    deleteGemKeywordTenderDocument,
} from "../../services/gem_keyword_tender_documents.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/", addGemKeywordTenderDocument, {
            body: t.Object({
                gem_keyword_tender_id: t.Numeric({ minimum: 1 }),
                name: t.String({ minLength: 1, maxLength: 128 }),
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
            }),
            detail: {
                tags: ["GEM Keyword Tender Documents"],
                summary: "Upload a document for a GEM keyword tender",
            },
        })
        .delete("/:id", deleteGemKeywordTenderDocument, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["GEM Keyword Tender Documents"],
                summary: "Delete a GEM keyword tender document",
            },
        });
}
