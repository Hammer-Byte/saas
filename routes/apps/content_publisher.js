import { t } from "elysia";
import { CONTENT_PUBLISHER_SERVICE, ERRORS } from "../../constants.js";
import {
    getContentPublishServiceRun,
    startContentPublishServiceRun,
} from "../../services/content_publish.js";

export default function (app) {
    return app
        .post("/", startContentPublishServiceRun, {
            body: t.Object({
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
                platforms: t.Union([t.String(), t.Array(t.String())]),
                instagram_access_token: t.Optional(t.String()),
                instagram_user_id: t.Optional(t.String()),
                instagram_caption: t.Optional(t.String()),
                instagram_destination: t.Optional(t.String()),
                youtube_cookie: t.Optional(t.String()),
                youtube_channel_id: t.Optional(t.String()),
                youtube_title: t.Optional(t.String()),
                youtube_description: t.Optional(t.String()),
                youtube_destination: t.Optional(t.String()),
                linkedin_cookie: t.Optional(t.String()),
                linkedin_company_id: t.Optional(t.String()),
                linkedin_caption: t.Optional(t.String()),
            }),
            detail: {
                tags: [CONTENT_PUBLISHER_SERVICE],
                summary: "Queue content publish run",
                description:
                    "Multipart image or video plus platform credentials. Returns { run_id }. Platforms: instagram, linkedin, youtube.",
            },
        })
        .get("/runs/:id", getContentPublishServiceRun, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: [CONTENT_PUBLISHER_SERVICE],
                summary: "Get content publish run status",
                description:
                    "Run and per-platform target status for this application, including screenshot URLs when present.",
            },
        });
}
