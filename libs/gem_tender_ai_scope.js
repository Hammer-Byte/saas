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

export function fillAiScopePrompt(
    template,
    { scopeOfWorkUrl, categories, confidenceThreshold },
) {
    const categoriesText = Array.isArray(categories)
        ? categories.map((name) => `- ${name}`).join("\n")
        : String(categories || "").trim();
    const threshold = normalizeConfidenceThreshold(
        confidenceThreshold ?? DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD,
    );
    return String(template || DEFAULT_GEM_TENDER_AI_PROMPT)
        .replaceAll("{{scope_of_work_url}}", String(scopeOfWorkUrl || "").trim())
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

/**
 * Analyze one tender. Safe to call from a background job.
 * Passes the SoW URL to OpenAI (no local download / pdftotext).
 * @returns {Promise<{status: string, reason?: string}>}
 */
export async function analyzeGemTenderAiScope({ gemTenderId }) {
    const id = Number(gemTenderId);
    if (!(id >= 1)) {
        return { status: "invalid_id" };
    }

    const tender = await getGemTenderById({ id });
    if (!tender) {
        return { status: "not_found" };
    }
    if (Number(tender.ai_analyzed)) {
        return { status: "already_analyzed" };
    }
    if (Number(tender.locked) || Number(tender.out_of_scope) || Number(tender.ineligible)) {
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
        logger.info(`gem_tender_ai_scope: OpenAI API key missing in settings, skip tender ${id}`);
        return { status: "skipped_no_api_key" };
    }

    const scopeOfWorkUrl = findScopeOfWorkUrl(tender.specification_links);
    if (!scopeOfWorkUrl) {
        return { status: "skipped_no_sow" };
    }

    const template = settings?.prompt_template || DEFAULT_GEM_TENDER_AI_PROMPT;
    if (
        !template.includes("{{scope_of_work_url}}") ||
        !template.includes("{{categories}}")
    ) {
        logger.error("gem_tender_ai_scope: prompt missing required placeholders");
        return { status: "skipped_bad_prompt" };
    }

    const categories = await loadAiScopeMatchLabels();
    if (!categories.length) {
        logger.info(`gem_tender_ai_scope: no keywords or GeM categories configured, skip tender ${id}`);
        return { status: "skipped_no_match_labels" };
    }
    const filledPrompt = fillAiScopePrompt(template, {
        scopeOfWorkUrl,
        categories,
        confidenceThreshold,
    });

    const tenderLabel = tender.tender_id || `#${id}`;

    let parsed;
    try {
        parsed = await openAiChatJson({
            apiKey,
            model,
            system: `You are a careful tender triage assistant. Inspect the attached Scope of Work document (PDF or image). Reply with JSON only, including confidence 0-100. Decisions below ${confidenceThreshold}% confidence will be ignored.`,
            user: filledPrompt,
            fileUrl: scopeOfWorkUrl,
        });
    } catch (error) {
        logger.error(`gem_tender_ai_scope OpenAI tender=${id}: ${error}`);
        return { status: "skipped_openai_error", reason: String(error) };
    }

    logger.info(
        `AI scope response: tender ${tenderLabel} → ${JSON.stringify(parsed)}`,
    );

    const reason = String(parsed?.reason || "").trim();

    if (parsed?.in_scope !== true && parsed?.in_scope !== false) {
        logger.info(
            `AI scope outcome: tender ${tenderLabel} → NO DECISION (unclear response; ai_analyzed left false)`,
        );
        return { status: "skipped_unclear_response", reason };
    }

    const confidence = normalizeAiScopeConfidence(parsed?.confidence);
    if (confidence == null || confidence < confidenceThreshold) {
        const confLabel = confidence == null ? "missing" : `${confidence}%`;
        logger.info(
            `AI scope outcome: tender ${tenderLabel} → NO DECISION (confidence ${confLabel}, need ≥${confidenceThreshold}%; ai_analyzed left false; nothing stored)${
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
            `AI scope stored: tender ${tenderLabel} → ai_analyzed=1, out_of_scope=0 (IN SCOPE ${confidence}%)${
                reason ? ` — ${reason}` : ""
            }`,
        );
        return { status: "in_scope", reason, confidence };
    }

    await applySystemOutOfScope({ id, reason });
    logger.info(
        `AI scope stored: tender ${tenderLabel} → ai_analyzed=1, out_of_scope=1, locked=1, hidden=1 (OUT OF SCOPE ${confidence}%)${
            reason ? ` — ${reason}` : ""
        }`,
    );
    return { status: "out_of_scope", reason, confidence };
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
