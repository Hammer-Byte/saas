import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export const GEM_TENDER_AI_SETTINGS_ID = 1;

export const DEFAULT_GEM_TENDER_AI_MODEL = "gpt-4o-mini";

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

Scope of work document URL:
{{scope_of_work_url}}

Use the scope-of-work document text provided with this request. Mark in_scope true only if the work clearly matches or is associated with at least one keyword or GeM category above; otherwise false.
Respond with JSON only: {"in_scope": true|false, "reason": "short explanation"}`;

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
    openai_api_key = undefined,
    openai_model = undefined,
    updated_by = null,
}) {
    const template = String(prompt_template || "").trim();
    const userId =
        updated_by != null && Number(updated_by) >= 1 ? Number(updated_by) : null;
    const model =
        openai_model != null && String(openai_model).trim()
            ? String(openai_model).trim()
            : DEFAULT_GEM_TENDER_AI_MODEL;

    const existing = await getGemTenderAiSettings();
    const nextKey =
        openai_api_key !== undefined
            ? openai_api_key == null || String(openai_api_key).trim() === ""
                ? null
                : String(openai_api_key).trim()
            : existing?.openai_api_key || null;

    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO GEM_TENDER_AI_SETTINGS (
                id,
                prompt_template,
                openai_api_key,
                openai_model,
                updated_by
            )
            VALUES (
                ${GEM_TENDER_AI_SETTINGS_ID},
                ${template},
                ${nextKey},
                ${model},
                ${userId}
            )
            ON DUPLICATE KEY UPDATE
                prompt_template = VALUES(prompt_template),
                openai_api_key = VALUES(openai_api_key),
                openai_model = VALUES(openai_model),
                updated_by = VALUES(updated_by)
        `,
    ).catch((error) => {
        logger.error(`upsertGemTenderAiSettings: ${error}`);
        throw error;
    });

    return await getGemTenderAiSettings();
}
