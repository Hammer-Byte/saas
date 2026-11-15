import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { logger } from "@hammerbyte/utils";
import { GEM_TENDER_LOCK_MESSAGES } from "../constants.js";
import {
    DEFAULT_GEM_TENDER_AI_MODEL,
    DEFAULT_GEM_TENDER_AI_PROMPT,
    getGemTenderAiSettings,
} from "../db/gem_tender_ai_settings.js";
import { getAllGemTenderCategories } from "../db/gem_tender_categories.js";
import {
    getGemTenderById,
    updateGemTenderById,
} from "../db/gem_tenders.js";
import { openAiChatJson } from "./openai_client.js";

const SOW_TEMP_DIR = "downloaded_tenders/ai_scope";
const MAX_SOW_TEXT_CHARS = 24000;

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

export function fillAiScopePrompt(template, { scopeOfWorkUrl, categories }) {
    const categoriesText = Array.isArray(categories)
        ? categories.map((name) => `- ${name}`).join("\n")
        : String(categories || "").trim();
    return String(template || DEFAULT_GEM_TENDER_AI_PROMPT)
        .replaceAll("{{scope_of_work_url}}", String(scopeOfWorkUrl || "").trim())
        .replaceAll("{{categories}}", categoriesText || "- (none configured)");
}

async function readPdfTextFromFile(filePath) {
    const process = Bun.spawn(["pdftotext", "-layout", filePath, "-"], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const exitCode = await process.exited;
    const text = await new Response(process.stdout).text();
    if (exitCode !== 0) {
        const errorText = await new Response(process.stderr).text();
        throw new Error(errorText.trim() || `pdftotext failed for ${filePath}`);
    }
    return text;
}

export async function downloadAndExtractScopeOfWorkText(url) {
    const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
            "User-Agent":
                "Mozilla/5.0 (compatible; HammerByteGEMBot/1.0; +https://hammerbyte.co.in)",
        },
    });
    if (!response.ok) {
        throw new Error(`SoW download failed HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
        throw new Error("SoW download returned an empty file");
    }

    await mkdir(SOW_TEMP_DIR, { recursive: true });
    const filePath = join(
        SOW_TEMP_DIR,
        `sow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`,
    );
    try {
        await writeFile(filePath, buffer);
        const text = await readPdfTextFromFile(filePath);
        return String(text || "").trim();
    } finally {
        await unlink(filePath).catch(() => {});
    }
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
    if (!apiKey) {
        logger.info(`gem_tender_ai_scope: OpenAI API key missing in settings, skip tender ${id}`);
        return { status: "skipped_no_api_key" };
    }

    const scopeOfWorkUrl = findScopeOfWorkUrl(tender.specification_links);
    if (!scopeOfWorkUrl) {
        return { status: "skipped_no_sow" };
    }

    let sowText = "";
    try {
        sowText = await downloadAndExtractScopeOfWorkText(scopeOfWorkUrl);
    } catch (error) {
        logger.error(`gem_tender_ai_scope SoW extract tender=${id}: ${error}`);
        return { status: "skipped_sow_download_failed", reason: String(error) };
    }
    if (!sowText) {
        return { status: "skipped_sow_empty" };
    }

    const template = settings?.prompt_template || DEFAULT_GEM_TENDER_AI_PROMPT;
    if (
        !template.includes("{{scope_of_work_url}}") ||
        !template.includes("{{categories}}")
    ) {
        logger.error("gem_tender_ai_scope: prompt missing required placeholders");
        return { status: "skipped_bad_prompt" };
    }

    const categories = (await getAllGemTenderCategories()).map(
        (row) => row.name || `Category #${row.id}`,
    );
    const filledPrompt = fillAiScopePrompt(template, {
        scopeOfWorkUrl,
        categories,
    });
    const truncatedSow =
        sowText.length > MAX_SOW_TEXT_CHARS
            ? `${sowText.slice(0, MAX_SOW_TEXT_CHARS)}\n\n[truncated]`
            : sowText;

    let parsed;
    try {
        parsed = await openAiChatJson({
            apiKey,
            model,
            system:
                "You are a careful tender triage assistant. Reply with JSON only.",
            user: `${filledPrompt}\n\n--- Scope of work document text ---\n${truncatedSow}`,
        });
    } catch (error) {
        logger.error(`gem_tender_ai_scope OpenAI tender=${id}: ${error}`);
        return { status: "skipped_openai_error", reason: String(error) };
    }

    const inScope = parsed?.in_scope === true;
    const reason = String(parsed?.reason || "").trim();

    if (parsed?.in_scope !== true && parsed?.in_scope !== false) {
        logger.error(`gem_tender_ai_scope unclear response tender=${id}: ${JSON.stringify(parsed)}`);
        return { status: "skipped_unclear_response" };
    }

    if (inScope) {
        await updateGemTenderById({ id, ai_analyzed: true });
        logger.info(`gem_tender_ai_scope in-scope tender=${id}`);
        return { status: "in_scope", reason };
    }

    await applySystemOutOfScope({ id, reason });
    logger.info(`gem_tender_ai_scope out-of-scope tender=${id}`);
    return { status: "out_of_scope", reason };
}
