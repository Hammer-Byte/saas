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
    const reason = result?.reason ? `: ${result.reason}` : "";
    ctx.setResultSummary(`${status}${reason}`);
    logger.info(`gem_tender_ai_scope job tender=${gemTenderId} → ${status}`);
}

async function finish(_ctx) {
    // No browser cleanup.
}

registerSeleniumJobHandler("gem_tender_ai_scope", { start, perform, finish });
