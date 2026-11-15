import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export const GEM_TENDER_AI_SETTINGS_ID = 1;

export const DEFAULT_GEM_TENDER_AI_MODEL = "gpt-4o-mini";

export const DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD = 80;

export const GEM_TENDER_AI_MODEL_OPTIONS = [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1-mini",
    "gpt-4.1",
    "o4-mini",
];

export const DEFAULT_GEM_TENDER_AI_PROMPT = `You help HammerByte decide if a GeM tender is in our service scope.

Our scan keywords and GeM categories (the Scope of Work should fall under or be associated with at least one of these):
{{categories}}

Inspect the attached Scope of Work document (PDF, scanned/image PDF, image, or other supported file). Mark in_scope true only if the work clearly matches or is associated with at least one keyword or GeM category above; otherwise false.
Also give confidence from 0 to 100 for how sure you are that you understood the document and that your in_scope decision is correct. If you cannot read or understand the document, set confidence below {{confidence_threshold}} and explain why.
Respond with JSON only: {"in_scope": true|false, "confidence": 0-100, "reason": "short explanation"}`;

export function normalizeConfidenceThreshold(raw) {
    const num = Number(raw);
    if (!Number.isFinite(num)) {
        return DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD;
    }
    return Math.min(100, Math.max(1, Math.round(num)));
}

export async function getGemTenderAiSettings() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM GEM_TENDER_AI_SETTINGS
            WHERE id = ${GEM_TENDER_AI_SETTINGS_ID}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getGemTenderAiSettings: ${error}`);
            return null;
        });
}

export async function upsertGemTenderAiSettings({
    prompt_template,
    openai_api_key = null,
    openai_model = undefined,
    confidence_threshold = undefined,
    updated_by = null,
}) {
    const template = String(prompt_template || "").trim();
    const userId =
        updated_by != null && Number(updated_by) >= 1 ? Number(updated_by) : null;
    const model =
        openai_model != null && String(openai_model).trim()
            ? String(openai_model).trim()
            : DEFAULT_GEM_TENDER_AI_MODEL;
    const nextKey = String(openai_api_key || "").trim() || null;
    const threshold = normalizeConfidenceThreshold(
        confidence_threshold ?? DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD,
    );

    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_TENDER_AI_SETTINGS (
                id,
                prompt_template,
                openai_api_key,
                openai_model,
                confidence_threshold,
                updated_by
            )
            VALUES (
                ${GEM_TENDER_AI_SETTINGS_ID},
                ${template},
                ${nextKey},
                ${model},
                ${threshold},
                ${userId}
            )
            ON DUPLICATE KEY UPDATE
                prompt_template = VALUES(prompt_template),
                openai_api_key = VALUES(openai_api_key),
                openai_model = VALUES(openai_model),
                confidence_threshold = VALUES(confidence_threshold),
                updated_by = VALUES(updated_by)
        `,
    ).catch((error) => {
        logger.error(`upsertGemTenderAiSettings: ${error}`);
        throw error;
    });

    return await getGemTenderAiSettings();
}
