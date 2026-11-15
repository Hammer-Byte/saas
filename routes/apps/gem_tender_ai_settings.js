import { t } from "elysia";
import {
    getGemTenderAiSettingsApi,
    updateGemTenderAiSettingsApi,
} from "../../services/gem_tender_ai_settings.js";

export default function (app) {
    return app
        .get("/", getGemTenderAiSettingsApi, {
            detail: {
                tags: ["GEM Tender AI"],
                summary: "Get AI scope analysis settings",
            },
        })
        .put("/", updateGemTenderAiSettingsApi, {
            body: t.Object({
                prompt_template: t.String({ minLength: 1, maxLength: 20000 }),
                openai_model: t.String({ minLength: 1, maxLength: 64 }),
                openai_api_key: t.Optional(t.String({ maxLength: 512 })),
                confidence_threshold: t.Optional(
                    t.Numeric({ minimum: 1, maximum: 100 }),
                ),
            }),
            detail: {
                tags: ["GEM Tender AI"],
                summary: "Update AI scope prompt, model, API key, and confidence threshold",
            },
        });
}
