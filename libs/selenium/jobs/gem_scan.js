import { logger } from "@hammerbyte/utils";
import { updateGemTenderScanRunById } from "../../../db/gem_tender_scan_runs.js";
import { toDbDateTime } from "../../date.js";
import { searchTendersByKeyword } from "../../tenderer/gem_crawler.js";
import { GEM_SEARCH_MODES } from "../../tenderer/gem_pom.js";
import { openHeadlessFirefox, quitDriver } from "../browser.js";
import { registerSeleniumSkipHook } from "../hooks.js";
import { registerSeleniumJobHandler } from "../registry.js";

async function start(ctx) {
    const runId = Number(ctx.payload?.runId);
    if (runId >= 1) {
        await updateGemTenderScanRunById({
            id: runId,
            status: "running",
        });
    }
    const driver = await openHeadlessFirefox({ label: "gem-scan" });
    ctx.setDriver(driver);
}

async function perform(ctx) {
    const keywordList = (ctx.payload?.keywords || [])
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

    if (!keywordList.length) {
        throw new Error("No keywords to scan");
    }

    const runId = Number(ctx.payload?.runId);
    const driver = ctx.getDriver();
    let tenderCount = 0;

    for (const keyword of keywordList) {
        if (ctx.shouldAbort()) {
            ctx.aborted = true;
            ctx.setResultSummary(`Stopped after ${tenderCount} tender(s)`);
            return;
        }

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

    ctx.setResultSummary(`${tenderCount} tender(s) from ${keywordList.length} keyword(s)`);
    ctx._tenderCount = tenderCount;
}

async function finish(ctx) {
    const runId = Number(ctx.payload?.runId);
    const tenderCount = Number(ctx._tenderCount || 0);
    await quitDriver(ctx.getDriver(), "gem-scan");
    ctx.setDriver(null);

    if (!(runId >= 1)) {
        return;
    }

    if (ctx.aborted || ctx.shouldAbort()) {
        await updateGemTenderScanRunById({
            id: runId,
            status: "failed",
            tender_count: tenderCount,
            error_message: ctx.errorMessage || "Stopped by operator",
            finished_on: toDbDateTime(new Date()),
        });
        return;
    }

    if (ctx.errorMessage) {
        await updateGemTenderScanRunById({
            id: runId,
            status: "failed",
            tender_count: tenderCount,
            error_message: ctx.errorMessage,
            finished_on: toDbDateTime(new Date()),
        });
        return;
    }

    await updateGemTenderScanRunById({
        id: runId,
        status: "completed",
        tender_count: tenderCount,
        finished_on: toDbDateTime(new Date()),
    });
}

registerSeleniumJobHandler("gem_scan", { start, perform, finish });

registerSeleniumSkipHook("gem_scan", async (job) => {
    const runId = Number(job?.payload?.runId || job?.domain_run_id);
    if (!(runId >= 1)) {
        return;
    }
    await updateGemTenderScanRunById({
        id: runId,
        status: "failed",
        error_message: "Skipped by operator",
        finished_on: toDbDateTime(new Date()),
    });
    logger.info(`gem_scan skip marked domain run ${runId} failed`);
});
