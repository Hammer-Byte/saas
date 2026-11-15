import { logger } from "@hammerbyte/utils";
import { analyzeGemTenderAiScope } from "../gem_tender_ai_scope.js";
import { enqueueSeleniumJob } from "./pipeline.js";

/**
 * Run AI scope in-process (does not need a browser). Prefer this during scans so
 * work is not blocked behind the single selenium gem_scan worker.
 */
export function scheduleGemTenderAiScope({ gemTenderId, tenderId = null }) {
    const id = Number(gemTenderId);
    if (!(id >= 1)) {
        return;
    }
    const label = tenderId ? String(tenderId) : `#${id}`;
    logger.info(`AI scope starting for tender ${label}`);
    void analyzeGemTenderAiScope({ gemTenderId: id })
        .then((result) => {
            const status = result?.status || "unknown";
            const reason = result?.reason ? String(result.reason).trim() : "";
            if (status === "in_scope" || status === "out_of_scope") {
                // Decision already logged inside analyzeGemTenderAiScope.
                return;
            }
            const summary = reason ? `${status}: ${reason}` : status;
            logger.info(`AI scope outcome: tender ${label} → ${summary}`);
        })
        .catch((error) => {
            logger.error(`AI scope failed for tender ${label}: ${error}`);
        });
}

/** Optional: enqueue via selenium pipeline (runs only when a worker slot is free). */
export async function enqueueGemTenderAiScopeJob({
    gemTenderId,
    tenderId = null,
    createdBy = null,
}) {
    const id = Number(gemTenderId);
    if (!(id >= 1)) {
        return null;
    }

    const label = tenderId ? String(tenderId) : `#${id}`;
    return await enqueueSeleniumJob({
        type: "gem_tender_ai_scope",
        source: "gem",
        title: `AI scope check (${label})`,
        payload: {
            gemTenderId: id,
            tenderId: tenderId || null,
        },
        created_by: createdBy,
        domain_run_id: id,
    });
}
