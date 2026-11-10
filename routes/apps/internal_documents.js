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
                visibility: t.Optional(
                    t.Union([t.Literal("everyone"), t.Literal("restricted")]),
                ),
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
                file: t.Optional(t.File()),
                description: t.Optional(t.String({ maxLength: 512 })),
                visibility: t.Optional(
                    t.Union([t.Literal("everyone"), t.Literal("restricted")]),
                ),
            }),
            detail: {
                tags: ["Internal Documents"],
                summary: "Update description, visibility, and optionally replace the file",
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
