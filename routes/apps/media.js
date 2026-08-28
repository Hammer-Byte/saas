import { t } from "elysia";
import { addMedia, getMedia } from "../../services/media.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/", addMedia, {
            body: t.Object({
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
            }),
            detail: {
                tags: ["Media"],
                summary: "Upload media file",
                description: "Stores the file on disk and returns the media id.",
            },
        })
        .get("/:id", getMedia, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Media"],
                summary: "Download media file",
                description: "Returns the stored file for the given media id.",
            },
        });
}
