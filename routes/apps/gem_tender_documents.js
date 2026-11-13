import { t } from "elysia";
import {
    addGemTenderDocument,
    deleteGemTenderDocument,
} from "../../services/gem_tender_documents.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/", addGemTenderDocument, {
            body: t.Object({
                gem_tender_id: t.Numeric({ minimum: 1 }),
                name: t.String({ minLength: 1, maxLength: 128 }),
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
            }),
            detail: {
                tags: ["GEM Tender Documents"],
                summary: "Upload a document for a GEM tender",
            },
        })
        .delete("/:id", deleteGemTenderDocument, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["GEM Tender Documents"],
                summary: "Delete a GEM tender document",
            },
        });
}
