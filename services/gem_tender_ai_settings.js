import {
    DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD,
    DEFAULT_GEM_TENDER_AI_MODEL,
    DEFAULT_GEM_TENDER_AI_PROMPT,
    GEM_TENDER_AI_MODEL_IDS,
    GEM_TENDER_AI_MODEL_OPTIONS,
    getGemTenderAiSettings,
    normalizeConfidenceThreshold,
    upsertGemTenderAiSettings,
} from "../db/gem_tender_ai_settings.js";
import { canUseGemCategories } from "./gem_categories.js";
import { getCurrentUser } from "./authentication.js";

async function requireScannerAuthority({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return null;
    }
    if (
        !canUseGemCategories(currentUser.authorities, {
            super_admin: currentUser.super_admin,
        })
    ) {
        set.status = 403;
        return null;
    }
    return currentUser;
}

function validatePromptTemplate(template) {
    const text = String(template || "").trim();
    if (!text) {
        return { error: "Prompt template is required" };
    }
    if (!text.includes("{{categories}}")) {
        return { error: "Prompt must include {{categories}}" };
    }
    if (text.length > 20000) {
        return { error: "Prompt template is too long" };
    }
    return { template: text };
}

function publicSettings(settings) {
    const model =
        String(settings?.openai_model || "").trim() || DEFAULT_GEM_TENDER_AI_MODEL;
    return {
        id: settings?.id || 1,
        prompt_template: settings?.prompt_template || DEFAULT_GEM_TENDER_AI_PROMPT,
        openai_model: GEM_TENDER_AI_MODEL_IDS.includes(model)
            ? model
            : DEFAULT_GEM_TENDER_AI_MODEL,
        openai_model_options: GEM_TENDER_AI_MODEL_OPTIONS,
        openai_api_key: String(settings?.openai_api_key || "").trim(),
        confidence_threshold: normalizeConfidenceThreshold(
            settings?.confidence_threshold ?? DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD,
        ),
        pricing_note:
            "GPT-4, GPT-5, and GPT-6 chat models are selectable (plus common reasoning models), with OpenAI standard USD per 1M tokens (input / output), cheapest first. SoW triage is mostly input tokens from the attached file; JSON output is tiny. We can pick the best cost/volume model later.",
        updated_on: settings?.updated_on || null,
        updated_by: settings?.updated_by || null,
        placeholders: [
            "{{categories}}",
            "{{confidence_threshold}}",
        ],
    };
}

export async function getGemTenderAiSettingsApi({ cookie, set }) {
    if (!(await requireScannerAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    let settings = await getGemTenderAiSettings();
    if (!settings) {
        settings = await upsertGemTenderAiSettings({
            prompt_template: DEFAULT_GEM_TENDER_AI_PROMPT,
            openai_model: DEFAULT_GEM_TENDER_AI_MODEL,
            openai_api_key: null,
            confidence_threshold: DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD,
            updated_by: null,
        });
    }

    set.status = 200;
    return { settings: publicSettings(settings) };
}

export async function updateGemTenderAiSettingsApi({ body, cookie, set }) {
    const currentUser = await requireScannerAuthority({ cookie, set });
    if (!currentUser) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const checked = validatePromptTemplate(body?.prompt_template);
    if (checked.error) {
        set.status = 400;
        return { error: checked.error };
    }

    const model = String(body?.openai_model || "").trim() || DEFAULT_GEM_TENDER_AI_MODEL;
    if (!GEM_TENDER_AI_MODEL_IDS.includes(model)) {
        set.status = 400;
        return { error: "Invalid OpenAI model" };
    }

    const openai_api_key = String(body?.openai_api_key || "").trim() || null;
    const confidence_threshold = normalizeConfidenceThreshold(
        body?.confidence_threshold ?? DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD,
    );

    try {
        const settings = await upsertGemTenderAiSettings({
            prompt_template: checked.template,
            openai_model: model,
            openai_api_key,
            confidence_threshold,
            updated_by: currentUser.id,
        });
        set.status = 200;
        return {
            message: "AI scope settings saved",
            settings: publicSettings(settings),
        };
    } catch (error) {
        set.status = 500;
        return { error: "Failed to save AI scope settings" };
    }
}
