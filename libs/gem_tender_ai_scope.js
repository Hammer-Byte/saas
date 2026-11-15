import { logger } from "@hammerbyte/utils";
import { GEM_TENDER_LOCK_MESSAGES } from "../constants.js";
import {
    DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD,
    DEFAULT_GEM_TENDER_AI_MODEL,
    DEFAULT_GEM_TENDER_AI_PROMPT,
    getGemTenderAiSettings,
    normalizeConfidenceThreshold,
} from "../db/gem_tender_ai_settings.js";
import { getAllGemCategories } from "../db/gem_categories.js";
import { getAllGemScanKeywords } from "../db/gem_scan_keywords.js";
import {
    getGemTenderById,
    updateGemTenderById,
} from "../db/gem_tenders.js";
import { openAiChatJson } from "./openai_client.js";

/** Keep prompts inside a safe size for the Responses API. */
const MAX_SOW_TEXT_CHARS = 100_000;

function parseSpecificationLinks(raw) {
    if (!raw) return [];
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => item && item.url);
    } catch (error) {
        return [];
    }
}

/** Prefer a link whose label mentions Scope of Work. */
export function findScopeOfWorkUrl(specification_links) {
    const links = parseSpecificationLinks(specification_links);
    const sow = links.find((item) =>
        /scope\s*of\s*work/i.test(String(item.label || "")),
    );
    if (sow?.url) return String(sow.url).trim();
    return null;
}

export function truncateSowText(raw) {
    const text = String(raw || "").trim();
    if (text.length <= MAX_SOW_TEXT_CHARS) {
        return { text, truncated: false };
    }
    return {
        text: text.slice(0, MAX_SOW_TEXT_CHARS),
        truncated: true,
        originalLength: text.length,
    };
}

export function fillAiScopePrompt(
    template,
    { scopeOfWorkText, categories, confidenceThreshold },
) {
    const categoriesText = Array.isArray(categories)
        ? categories.map((name) => `- ${name}`).join("\n")
        : String(categories || "").trim();
    const threshold = normalizeConfidenceThreshold(
        confidenceThreshold ?? DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD,
    );
    return String(template || DEFAULT_GEM_TENDER_AI_PROMPT)
        .replaceAll("{{scope_of_work_text}}", String(scopeOfWorkText || "").trim())
        // Older saved prompts may still use the URL placeholder; treat it as text.
        .replaceAll("{{scope_of_work_url}}", String(scopeOfWorkText || "").trim())
        .replaceAll("{{categories}}", categoriesText || "- (none configured)")
        .replaceAll("{{confidence_threshold}}", String(threshold));
}

/** Labels for {{categories}}: scan keywords + all GeM categories. */
export async function loadAiScopeMatchLabels() {
    const [keywords, gemCategories] = await Promise.all([
        getAllGemScanKeywords(),
        getAllGemCategories(),
    ]);

    const labels = [];
    for (const row of keywords || []) {
        const keyword = String(row?.keyword || "").trim();
        if (keyword) {
            labels.push(`Keyword: ${keyword}`);
        }
    }
    for (const row of gemCategories || []) {
        const name = String(row?.name || "").trim();
        if (!name) continue;
        const group = String(row?.group_name || "").trim();
        labels.push(group ? `GeM category: ${group} › ${name}` : `GeM category: ${name}`);
    }
    return labels;
}

export async function applySystemOutOfScope({ id, reason = null }) {
    const lockMessage = reason
        ? `${GEM_TENDER_LOCK_MESSAGES.OUT_OF_SCOPE}: ${String(reason).trim().slice(0, 180)}`
        : GEM_TENDER_LOCK_MESSAGES.OUT_OF_SCOPE;

    await updateGemTenderById({
        id,
        eligible: false,
        ineligible: false,
        out_of_scope: true,
        stage: null,
        locked: true,
        lock_message: lockMessage,
        hidden: true,
        ai_analyzed: true,
    });
}

/** Accept 0–100, or fractional 0–1 (exclusive of 0/1 so `1` stays 1%). */
function normalizeAiScopeConfidence(raw) {
    if (raw == null || raw === "") return null;
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    if (num > 0 && num < 1) {
        return Math.round(num * 100);
    }
    if (num < 0 || num > 100) return null;
    return Math.round(num);
}

/**
 * Analyze one tender using already-extracted Scope of Work text.
 * Called inline from the GEM scan insert path.
 * @returns {Promise<{status: string, reason?: string, confidence?: number|null}>}
 */
export async function analyzeGemTenderAiScope({
    gemTenderId,
    tenderId = null,
    sowText = "",
}) {
    const id = Number(gemTenderId);
    const tenderLabel = tenderId ? String(tenderId) : `#${id}`;
    if (!(id >= 1)) {
        logger.info(`AI scope skip: tender ${tenderLabel} → invalid_id`);
        return { status: "invalid_id" };
    }

    const { text: scopeText, truncated, originalLength } = truncateSowText(sowText);
    if (!scopeText) {
        logger.info(`AI scope skip: tender ${tenderLabel} → skipped_empty_sow`);
        return { status: "skipped_empty_sow" };
    }
    if (truncated) {
        logger.info(
            `AI scope: tender ${tenderLabel} SoW truncated from ${originalLength} to ${MAX_SOW_TEXT_CHARS} chars`,
        );
    }

    const tender = await getGemTenderById({ id });
    if (!tender) {
        logger.info(`AI scope skip: tender ${tenderLabel} → not_found`);
        return { status: "not_found" };
    }
    if (Number(tender.ai_analyzed)) {
        logger.info(`AI scope skip: tender ${tenderLabel} → already_analyzed`);
        return { status: "already_analyzed" };
    }
    if (Number(tender.locked) || Number(tender.out_of_scope) || Number(tender.ineligible)) {
        logger.info(`AI scope skip: tender ${tenderLabel} → already_closed`);
        return { status: "already_closed" };
    }

    const settings = await getGemTenderAiSettings();
    const apiKey = String(settings?.openai_api_key || "").trim();
    const model =
        String(settings?.openai_model || "").trim() || DEFAULT_GEM_TENDER_AI_MODEL;
    const confidenceThreshold = normalizeConfidenceThreshold(
        settings?.confidence_threshold ?? DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD,
    );
    if (!apiKey) {
        logger.info(`AI scope skip: tender ${tenderLabel} → skipped_no_api_key`);
        return { status: "skipped_no_api_key" };
    }

    const template = settings?.prompt_template || DEFAULT_GEM_TENDER_AI_PROMPT;
    const hasTextPlaceholder =
        template.includes("{{scope_of_work_text}}") ||
        template.includes("{{scope_of_work_url}}");
    if (!hasTextPlaceholder || !template.includes("{{categories}}")) {
        logger.error(
            `AI scope skip: tender ${tenderLabel} → skipped_bad_prompt (need {{scope_of_work_text}} and {{categories}})`,
        );
        return { status: "skipped_bad_prompt" };
    }

    const categories = await loadAiScopeMatchLabels();
    if (!categories.length) {
        logger.info(`AI scope skip: tender ${tenderLabel} → skipped_no_match_labels`);
        return { status: "skipped_no_match_labels" };
    }

    const filledPrompt = fillAiScopePrompt(template, {
        scopeOfWorkText: scopeText,
        categories,
        confidenceThreshold,
    });

    logger.info(
        `AI scope start: tender ${tenderLabel} model=${model} threshold=${confidenceThreshold}% sowChars=${scopeText.length} labels=${categories.length}`,
    );

    const startedAt = Date.now();
    let parsed;
    try {
        parsed = await openAiChatJson({
            apiKey,
            model,
            system: `You are a careful tender triage assistant. Inspect the Scope of Work text. Reply with JSON only, including confidence 0-100. Decisions below ${confidenceThreshold}% confidence will be ignored.`,
            user: filledPrompt,
        });
    } catch (error) {
        logger.error(
            `AI scope OpenAI error: tender ${tenderLabel} after ${Date.now() - startedAt}ms → ${error}`,
        );
        return { status: "skipped_openai_error", reason: String(error) };
    }

    logger.info(
        `AI scope response: tender ${tenderLabel} after ${Date.now() - startedAt}ms → ${JSON.stringify(parsed)}`,
    );

    const reason = String(parsed?.reason || "").trim();

    if (parsed?.in_scope !== true && parsed?.in_scope !== false) {
        logger.info(
            `AI scope outcome: tender ${tenderLabel} → SKIPPED_UNCLEAR_RESPONSE (ai_analyzed left false)${
                reason ? ` — ${reason}` : ""
            }`,
        );
        return { status: "skipped_unclear_response", reason };
    }

    const confidence = normalizeAiScopeConfidence(parsed?.confidence);
    if (confidence == null || confidence < confidenceThreshold) {
        const confLabel = confidence == null ? "missing" : `${confidence}%`;
        logger.info(
            `AI scope outcome: tender ${tenderLabel} → SKIPPED_LOW_CONFIDENCE (confidence ${confLabel}, need ≥${confidenceThreshold}%; nothing stored)${
                reason ? ` — ${reason}` : ""
            }`,
        );
        return {
            status: "skipped_low_confidence",
            reason,
            confidence: confidence == null ? null : confidence,
        };
    }

    const inScope = parsed.in_scope === true;

    if (inScope) {
        await updateGemTenderById({ id, ai_analyzed: true });
        logger.info(
            `AI scope outcome: tender ${tenderLabel} → IN_SCOPE (${confidence}%) ai_analyzed=1${
                reason ? ` — ${reason}` : ""
            }`,
        );
        return { status: "in_scope", reason, confidence };
    }

    await applySystemOutOfScope({ id, reason });
    logger.info(
        `AI scope outcome: tender ${tenderLabel} → OUT_OF_SCOPE (${confidence}%) locked=1 hidden=1 ai_analyzed=1${
            reason ? ` — ${reason}` : ""
        }`,
    );
    return { status: "out_of_scope", reason, confidence };
}
