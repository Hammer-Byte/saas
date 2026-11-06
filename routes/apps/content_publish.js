import { t } from "elysia";
import {
    getContentPublishRun,
    getContentPublishRuns,
    getContentPublishScreenshot,
    getContentPublishStatus,
    startContentPublishRun,
} from "../../services/content_publish.js";

export default function (app) {
    return app
        .get("/status", getContentPublishStatus, {
            detail: {
                tags: ["Content Publish"],
                summary: "Content publish processing status",
            },
        })
        .get("/runs", getContentPublishRuns, {
            detail: {
                tags: ["Content Publish"],
                summary: "List content publish runs",
            },
        })
        .get("/runs/:id", getContentPublishRun, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Content Publish"],
                summary: "Get content publish run",
            },
        })
        .get("/screenshots/:file", getContentPublishScreenshot, {
            params: t.Object({
                file: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["Content Publish"],
                summary: "View content publish failure screenshot",
            },
        })
        .post("/start", startContentPublishRun, {
            body: t.Object({
                media_id: t.Numeric({ minimum: 1 }),
                automation_user_id: t.Numeric({ minimum: 1 }),
                platforms: t.Array(
                    t.Union([
                        t.Literal("facebook"),
                        t.Literal("instagram"),
                        t.Literal("youtube"),
                        t.Literal("linkedin"),
                    ]),
                    { minItems: 1 },
                ),
                facebook_caption: t.Optional(t.String()),
                instagram_caption: t.Optional(t.String()),
                instagram_hashtags: t.Optional(t.String()),
                instagram_user_id: t.Optional(t.String()),
                youtube_channel_id: t.Optional(t.String()),
                youtube_title: t.Optional(t.String()),
                youtube_description: t.Optional(t.String()),
                linkedin_company_id: t.Optional(t.String()),
                linkedin_caption: t.Optional(t.String()),
            }),
            detail: {
                tags: ["Content Publish"],
                summary: "Start content publish run",
            },
        });
}