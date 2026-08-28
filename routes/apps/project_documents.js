import { t } from "elysia";
import { addProjectDocument } from "../../services/project_documents.js";

export default function (app) {
    return app.post("/", addProjectDocument, {
        body: t.Object({
            project_id: t.Numeric({ minimum: 1 }),
            media_id: t.Numeric({ minimum: 1 }),
            description: t.Optional(t.String({ maxLength: 512 })),
        }),
        detail: {
            tags: ["Project Documents"],
            summary: "Link a media file to a project",
        },
    });
}
