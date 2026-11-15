import {
    DEFAULT_GEM_TENDER_AI_MODEL,
    DEFAULT_GEM_TENDER_AI_PROMPT,
    GEM_TENDER_AI_MODEL_OPTIONS,
    getGemTenderAiSettings,
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
    if (!text.includes("{{scope_of_work_url}}")) {
        return { error: "Prompt must include {{scope_of_work_url}}" };
    }
    if (!text.includes("{{categories}}")) {
        return { error: "Prompt must include {{categories}}" };
    }
    if (text.length > 20000) {
        return { error: "Prompt template is too long" };
    }
    return { template: text };
}

function maskApiKey(key) {
    const raw = String(key || "").trim();
    if (!raw) return "";
    if (raw.length <= 8) return "••••••••";
    return `${raw.slice(0, 3)}…${raw.slice(-4)}`;
}

function publicSettings(settings) {
    const key = String(settings?.openai_api_key || "").trim();
    const model =
        String(settings?.openai_model || "").trim() || DEFAULT_GEM_TENDER_AI_MODEL;
    return {
        id: settings?.id || 1,
        prompt_template: settings?.prompt_template || DEFAULT_GEM_TENDER_AI_PROMPT,
        openai_model: model,
        openai_model_options: GEM_TENDER_AI_MODEL_OPTIONS,
        openai_configured: !!key,
        openai_api_key_masked: key ? maskApiKey(key) : "",
        updated_on: settings?.updated_on || null,
        updated_by: settings?.updated_by || null,
        placeholders: ["{{scope_of_work_url}}", "{{categories}}"],
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
    if (!GEM_TENDER_AI_MODEL_OPTIONS.includes(model)) {
        set.status = 400;
        return { error: "Invalid OpenAI model" };
    }

    // Only update the key when the client sends a new non-masked value.
    // Empty string clears the key. Omit / masked value keeps the existing key.
    const rawKey = body?.openai_api_key;
    let openai_api_key = undefined;
    if (rawKey !== undefined && rawKey !== null) {
        const trimmed = String(rawKey).trim();
        if (!trimmed) {
            openai_api_key = null;
        } else if (trimmed.includes("…") || trimmed.includes("•")) {
            openai_api_key = undefined;
        } else {
            openai_api_key = trimmed;
        }
    }

    try {
        const settings = await upsertGemTenderAiSettings({
            prompt_template: checked.template,
            openai_model: model,
            openai_api_key,
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
