import { t } from "elysia";
import {
    addInternalDocument,
    deleteInternalDocument,
    updateInternalDocument,
} from "../../services/internal_documents.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/", addInternalDocument, {
            body: t.Object({
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
                description: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["Internal Documents"],
                summary: "Create an internal document",
            },
        })
        .patch("/:id", updateInternalDocument, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            body: t.Object({
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
                description: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["Internal Documents"],
                summary: "Replace internal document file and update description",
            },
        })
        .delete("/:id", deleteInternalDocument, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Internal Documents"],
                summary: "Delete an internal document",
            },
        });
}
