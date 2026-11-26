import { t } from "elysia";
import {
    addGemDocument,
    deleteGemDocument,
    getGemDocument,
    listGemDocuments,
    updateGemDocument,
} from "../../services/gem_documents.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .get("/", listGemDocuments, {
            detail: {
                tags: ["GEM Documents"],
                summary: "List GEM section documents",
            },
        })
        .get("/:id", getGemDocument, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["GEM Documents"],
                summary: "Get a GEM document by id",
            },
        })
        .post("/", addGemDocument, {
            body: t.Object({
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
                description: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["GEM Documents"],
                summary: "Create a GEM document",
            },
        })
        .patch("/:id", updateGemDocument, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            body: t.Object({
                file: t.Optional(t.File()),
                description: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["GEM Documents"],
                summary: "Update description and optionally replace the file",
            },
        })
        .delete("/:id", deleteGemDocument, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["GEM Documents"],
                summary: "Delete a GEM document",
            },
        });
}
