import { logger } from "@hammerbyte/utils";
import {
    recoverStaleGemTenderScanRuns,
    updateGemTenderScanRunById,
} from "../db/gem_tender_scan_runs.js";
import { toDbDateTime } from "./date.js";
import { openHeadlessFirefox, quitDriver } from "./gem_browser.js";
import { searchTendersByKeyword } from "./tenderer/gem_crawler.js";
import { GEM_SEARCH_MODES } from "./tenderer/gem_pom.js";

let queueTail = Promise.resolve();

function normalizeKeywords(keywords) {
    return (keywords || [])
        .map((entry) => ({
            keyword: String(entry?.keyword || "").trim(),
            exact_search: !!entry?.exact_search,
            category_group_id:
                entry?.category_group_id != null && Number(entry.category_group_id) >= 1
                    ? Number(entry.category_group_id)
                    : null,
            tender_category_id:
                entry?.tender_category_id != null && Number(entry.tender_category_id) >= 1
                    ? Number(entry.tender_category_id)
                    : null,
            search_mode:
                entry?.search_mode === GEM_SEARCH_MODES.ALL_BIDS
                    ? GEM_SEARCH_MODES.ALL_BIDS
                    : GEM_SEARCH_MODES.ADVANCE_SEARCH,
        }))
        .filter((entry) => entry.keyword);
}

async function runGemScan({ runId, keywords }) {
    const keywordList = normalizeKeywords(keywords);
    if (!keywordList.length) {
        throw new Error("No keywords to scan");
    }

    if (runId >= 1) {
        await updateGemTenderScanRunById({
            id: runId,
            status: "running",
        });
    }

    let driver = null;
    let tenderCount = 0;

    try {
        driver = await openHeadlessFirefox({ label: "gem-scan" });

        for (const keyword of keywordList) {
            const createdCount = await searchTendersByKeyword(driver, keyword);
            tenderCount += Number(createdCount || 0);

            if (runId >= 1) {
                await updateGemTenderScanRunById({
                    id: runId,
                    status: "running",
                    tender_count: tenderCount,
                });
            }
        }

        if (runId >= 1) {
            await updateGemTenderScanRunById({
                id: runId,
                status: "completed",
                tender_count: tenderCount,
                finished_on: toDbDateTime(new Date()),
            });
        }

        logger.info(
            `gem scan ${runId || "adhoc"} completed — ${tenderCount} tender(s) from ${keywordList.length} keyword(s)`,
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`gem scan ${runId || "adhoc"} failed: ${message}`);
        if (runId >= 1) {
            await updateGemTenderScanRunById({
                id: runId,
                status: "failed",
                tender_count: tenderCount,
                error_message: message,
                finished_on: toDbDateTime(new Date()),
            });
        }
    } finally {
        await quitDriver(driver, "gem-scan");
    }
}

/**
 * Queue a GeM scan on a single in-process chain (one browser at a time).
 * Returns a job-like handle for API compatibility ({ id }).
 */
export function enqueueGemScanJob({ runId, keywords }) {
    const id = Number(runId) >= 1 ? Number(runId) : Date.now();
    queueTail = queueTail
        .then(() => runGemScan({ runId: Number(runId), keywords }))
        .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`gem scan queue error: ${message}`);
        });
    return { id };
}

export async function initGemScanRunner() {
    await recoverStaleGemTenderScanRuns({
        finished_on: toDbDateTime(new Date()),
    });
    logger.info("GeM scan runner ready");
}
