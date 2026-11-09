import { t } from "elysia";
import {
    addGemMandatoryDocument,
    copyInternalDocumentToGemMandatory,
    deleteGemMandatoryDocument,
    updateGemMandatoryDocument,
} from "../../services/gem_mandatory_documents.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/", addGemMandatoryDocument, {
            body: t.Object({
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
                description: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["GEM Mandatory Documents"],
                summary: "Create a GEM mandatory document",
            },
        })
        .post("/copy-from-internal", copyInternalDocumentToGemMandatory, {
            body: t.Object({
                internal_document_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["GEM Mandatory Documents"],
                summary: "Copy an internal document into GEM mandatory documents (shared media)",
            },
        })
        .patch("/:id", updateGemMandatoryDocument, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            body: t.Object({
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
                description: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["GEM Mandatory Documents"],
                summary: "Replace mandatory document file and update description",
            },
        })
        .delete("/:id", deleteGemMandatoryDocument, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["GEM Mandatory Documents"],
                summary: "Delete a GEM mandatory document",
            },
        });
}
