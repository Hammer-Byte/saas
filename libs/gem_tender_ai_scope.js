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
    { categories, confidenceThreshold },
) {
    const categoriesText = Array.isArray(categories)
        ? categories.map((name) => `- ${name}`).join("\n")
        : String(categories || "").trim();
    const threshold = normalizeConfidenceThreshold(
        confidenceThreshold ?? DEFAULT_GEM_TENDER_AI_CONFIDENCE_THRESHOLD,
    );
    // Older saved prompts may still mention URL/text placeholders; SoW is attached as a file.
    const attachedNote = "(Scope of Work document is attached to this request)";
    return String(template || DEFAULT_GEM_TENDER_AI_PROMPT)
        .replaceAll("{{scope_of_work_url}}", attachedNote)
        .replaceAll("{{scope_of_work_text}}", attachedNote)
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

export async function applySystemOutOfScope({
    id,
    reason = null,
    confidence = null,
}) {
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
        ai_confidence: confidence,
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
 * Analyze one tender by uploading the Scope of Work file to OpenAI (PDF / image).
 * Called inline from the GEM scan insert path.
 * @returns {Promise<{status: string, reason?: string, confidence?: number|null}>}
 */
export async function analyzeGemTenderAiScope({
    gemTenderId,
    tenderId = null,
    buffer = null,
    mimeType = "application/pdf",
    filename = "scope_of_work.pdf",
}) {
    const id = Number(gemTenderId);
    const tenderLabel = tenderId ? String(tenderId) : `#${id}`;
    if (!(id >= 1)) {
        logger.info(
            `AI scope skip: tender ${tenderLabel} → invalid_id (gem tender id missing or invalid)`,
        );
        return { status: "invalid_id" };
    }

    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        logger.info(
            `AI scope skip: tender ${tenderLabel} → skipped_no_sow (no Scope of Work file buffer)`,
        );
        return { status: "skipped_no_sow" };
    }

    const tender = await getGemTenderById({ id });
    if (!tender) {
        logger.info(
            `AI scope skip: tender ${tenderLabel} → not_found (row missing in GEM_TENDERS)`,
        );
        return { status: "not_found" };
    }
    if (Number(tender.ai_analyzed)) {
        logger.info(
            `AI scope skip: tender ${tenderLabel} → already_analyzed (ai_analyzed already set)`,
        );
        return { status: "already_analyzed" };
    }
    if (Number(tender.locked) || Number(tender.out_of_scope) || Number(tender.ineligible)) {
        const closed = [];
        if (Number(tender.locked)) closed.push("locked");
        if (Number(tender.out_of_scope)) closed.push("out_of_scope");
        if (Number(tender.ineligible)) closed.push("ineligible");
        logger.info(
            `AI scope skip: tender ${tenderLabel} → already_closed (${closed.join(", ")})`,
        );
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
        logger.info(
            `AI scope skip: tender ${tenderLabel} → skipped_no_api_key (OpenAI API key not configured)`,
        );
        return { status: "skipped_no_api_key" };
    }

    const template = settings?.prompt_template || DEFAULT_GEM_TENDER_AI_PROMPT;
    if (!template.includes("{{categories}}")) {
        logger.error(
            `AI scope skip: tender ${tenderLabel} → skipped_bad_prompt (prompt template must include {{categories}})`,
        );
        return { status: "skipped_bad_prompt" };
    }

    const categories = await loadAiScopeMatchLabels();
    if (!categories.length) {
        logger.info(
            `AI scope skip: tender ${tenderLabel} → skipped_no_match_labels (no AI match category labels configured)`,
        );
        return { status: "skipped_no_match_labels" };
    }

    const filledPrompt = fillAiScopePrompt(template, {
        categories,
        confidenceThreshold,
    });

    logger.info(
        `AI scope start: tender ${tenderLabel} model=${model} threshold=${confidenceThreshold}% file=${filename} bytes=${buffer.length} mime=${mimeType} labels=${categories.length}`,
    );

    const startedAt = Date.now();
    let parsed;
    try {
        parsed = await openAiChatJson({
            apiKey,
            model,
            system: `You are a careful tender triage assistant. Inspect the attached Scope of Work document (PDF, image, or other supported file). Reply with JSON only, including confidence 0-100. Decisions below ${confidenceThreshold}% confidence will be ignored.`,
            user: filledPrompt,
            fileBuffer: buffer,
            filename,
            mimeType,
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
        await updateGemTenderById({
            id,
            ai_analyzed: true,
            ai_confidence: confidence,
        });
        logger.info(
            `AI scope outcome: tender ${tenderLabel} → IN_SCOPE (${confidence}%) ai_analyzed=1 ai_confidence=${confidence}${
                reason ? ` — ${reason}` : ""
            }`,
        );
        return { status: "in_scope", reason, confidence };
    }

    await applySystemOutOfScope({ id, reason, confidence });
    logger.info(
        `AI scope outcome: tender ${tenderLabel} → OUT_OF_SCOPE (${confidence}%) locked=1 hidden=1 ai_analyzed=1 ai_confidence=${confidence}${
            reason ? ` — ${reason}` : ""
        }`,
    );
    return { status: "out_of_scope", reason, confidence };
}
