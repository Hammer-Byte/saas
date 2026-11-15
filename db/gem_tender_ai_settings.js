import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export const GEM_TENDER_AI_SETTINGS_ID = 1;

export const DEFAULT_GEM_TENDER_AI_MODEL = "gpt-4o-mini";

export const DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD = 80;

/**
 * Models for GeM SoW triage (Responses API + attached file).
 * Full GPT-4 / GPT-5 / GPT-6 chat lineup + common reasoning models.
 * Prices: OpenAI standard USD per 1M tokens (input / output), cheapest → costliest.
 * Source: https://developers.openai.com/api/docs/pricing (approx. Nov 2026).
 * Image / audio / embedding / Cyber / Rosalind omitted.
 */
function gemAiModelOption(id, inputPerMillion, outputPerMillion, note = "") {
    const fmt = (n) => {
        const num = Number(n);
        if (!Number.isFinite(num)) return String(n);
        return Number.isInteger(num) ? String(num) : String(num);
    };
    const cost = `$${fmt(inputPerMillion)} / $${fmt(outputPerMillion)} per 1M in/out`;
    return {
        id,
        label: note ? `${id} — ${cost} · ${note}` : `${id} — ${cost}`,
        input_per_million: inputPerMillion,
        output_per_million: outputPerMillion,
    };
}

export const GEM_TENDER_AI_MODEL_OPTIONS = [
    // ——— cheapest / volume ———
    gemAiModelOption("gpt-5-nano", 0.05, 0.4, "GPT-5 · lowest cost"),
    gemAiModelOption("gpt-4.1-nano", 0.1, 0.4, "GPT-4.1 · cheap"),
    gemAiModelOption("gpt-6-luna", 0.1, 0.5, "GPT-6 · volume / planned"),
    gemAiModelOption("gpt-4o-mini", 0.15, 0.6, "GPT-4o · default"),
    gemAiModelOption("gpt-5.4-nano", 0.2, 1.25, "GPT-5.4"),
    gemAiModelOption("gpt-5.6-luna", 0.2, 1.2, "GPT-5.6 · cheap"),
    gemAiModelOption("gpt-5-mini", 0.25, 2, "GPT-5"),
    gemAiModelOption("gpt-4.1-mini", 0.4, 1.6, "GPT-4.1"),
    gemAiModelOption("gpt-5.4-mini", 0.75, 4.5, "GPT-5.4"),
    // ——— mid ———
    gemAiModelOption("gpt-6.1-terra", 1, 5, "GPT-6.1 · mid"),
    gemAiModelOption("o4-mini", 1.1, 4.4, "reasoning mini"),
    gemAiModelOption("o3-mini", 1.1, 4.4, "reasoning mini"),
    gemAiModelOption("gpt-5", 1.25, 10, "GPT-5"),
    gemAiModelOption("gpt-5.1", 1.25, 10, "GPT-5.1"),
    gemAiModelOption("gpt-5.2", 1.75, 14, "GPT-5.2"),
    gemAiModelOption("gpt-4.1", 2, 8, "GPT-4.1"),
    gemAiModelOption("o3", 2, 8, "reasoning"),
    gemAiModelOption("gpt-6-sol", 2, 10, "GPT-6 · stronger"),
    gemAiModelOption("gpt-6.1-sol", 2, 10, "GPT-6.1 · stronger"),
    gemAiModelOption("gpt-5.6-terra", 2, 12, "GPT-5.6 · mid"),
    gemAiModelOption("gpt-4o", 2.5, 10, "GPT-4o"),
    gemAiModelOption("gpt-5.4", 2.5, 15, "GPT-5.4"),
    gemAiModelOption("gpt-5.6-sol", 4, 20, "GPT-5.6 · stronger"),
    gemAiModelOption("gpt-5.5", 5, 30, "GPT-5.5"),
    // ——— legacy GPT-4 ———
    gemAiModelOption("gpt-4-turbo", 10, 30, "GPT-4 Turbo · legacy"),
    gemAiModelOption("gpt-6-astra", 10, 50, "GPT-6 · top"),
    // ——— pro / expensive ———
    gemAiModelOption("gpt-5-pro", 15, 120, "GPT-5 pro"),
    gemAiModelOption("o3-pro", 20, 80, "reasoning pro"),
    gemAiModelOption("gpt-5.2-pro", 21, 168, "GPT-5.2 pro"),
    gemAiModelOption("gpt-4", 30, 60, "GPT-4 · legacy"),
    gemAiModelOption("gpt-5.4-pro", 30, 180, "GPT-5.4 pro"),
    gemAiModelOption("gpt-5.5-pro", 30, 180, "GPT-5.5 pro"),
];

export const GEM_TENDER_AI_MODEL_IDS = GEM_TENDER_AI_MODEL_OPTIONS.map(
    (option) => option.id,
);

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
