import { t } from "elysia";
import {
    addProjectDocument,
    deleteProjectDocument,
    updateProjectDocument,
} from "../../services/project_documents.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/", addProjectDocument, {
            body: t.Object({
                project_id: t.Numeric({ minimum: 1 }),
                media_id: t.Numeric({ minimum: 1 }),
                description: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["Project Documents"],
                summary: "Link a media file to a project",
            },
        })
        .patch("/:id", updateProjectDocument, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            body: t.Object({
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
                description: t.Optional(t.String({ maxLength: 512 })),
            }),
            detail: {
                tags: ["Project Documents"],
                summary: "Replace project document file and update description",
            },
        })
        .delete("/:id", deleteProjectDocument, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Project Documents"],
                summary: "Delete a project document",
            },
        });
}
