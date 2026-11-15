import { logger } from "@hammerbyte/utils";
import { analyzeGemTenderAiScope } from "../../gem_tender_ai_scope.js";
import { registerSeleniumJobHandler } from "../registry.js";

async function start(_ctx) {
    // No browser — OpenAI + PDF text only.
}

async function perform(ctx) {
    const gemTenderId = Number(ctx.payload?.gemTenderId);
    if (!(gemTenderId >= 1)) {
        throw new Error("gemTenderId is required");
    }

    if (ctx.shouldAbort()) {
        ctx.aborted = true;
        ctx.setResultSummary("Stopped before AI scope analysis");
        return;
    }

    const result = await analyzeGemTenderAiScope({ gemTenderId });
    const status = result?.status || "unknown";
    const reason = result?.reason ? String(result.reason).trim() : "";
    const tenderLabel = ctx.payload?.tenderId || `#${gemTenderId}`;
    const summary = reason ? `${status}: ${reason}` : status;
    ctx.setResultSummary(summary);
    // Decision outcomes are logged inside analyzeGemTenderAiScope; log skips/errors here.
    if (status !== "in_scope" && status !== "out_of_scope") {
        logger.info(`AI scope outcome: tender ${tenderLabel} → ${summary}`);
    }
}

async function finish(_ctx) {
    // No browser cleanup.
}

registerSeleniumJobHandler("gem_tender_ai_scope", { start, perform, finish });
