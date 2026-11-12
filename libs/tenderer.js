import { Builder, Browser } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { logger } from "@hammerbyte/utils";
import { updateGemTenderScanRunById } from "../db/gem_tender_scan_runs.js";
import { toDbDateTime } from "./date.js";
import { searchTendersByKeyword } from "./tenderer/gem_crawler.js";
import { GEM_SEARCH_MODES } from "./tenderer/gem_pom.js";

export let processing = false;

export function crawlGemForTenders({ keywords = [], runId = null } = {}) {
    if (processing) {
        return false;
    }

    processing = true;

    const keywordList = (keywords || [])
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
        processing = false;
        return false;
    }

    (async () => {
        let driver = null;
        let tenderCount = 0;

        try {
            const options = new firefox.Options()
                .addArguments("-headless")
                .windowSize({ width: 1920, height: 1080 });

            driver = await new Builder()
                .forBrowser(Browser.FIREFOX)
                .setFirefoxOptions(options)
                .build();

            for (const keyword of keywordList) {
                const createdCount = await searchTendersByKeyword(driver, keyword);
                tenderCount += Number(createdCount || 0);

                if (runId) {
                    await updateGemTenderScanRunById({
                        id: runId,
                        status: "running",
                        tender_count: tenderCount,
                    });
                }
            }

            if (runId) {
                await updateGemTenderScanRunById({
                    id: runId,
                    status: "completed",
                    tender_count: tenderCount,
                    finished_on: toDbDateTime(new Date()),
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`gem tenderer crawl failed: ${message}`);

            if (runId) {
                await updateGemTenderScanRunById({
                    id: runId,
                    status: "failed",
                    tender_count: tenderCount,
                    error_message: message,
                    finished_on: toDbDateTime(new Date()),
                });
            }
        } finally {
            if (driver) {
                await driver.quit().catch((error) => {
                    logger.error(`gem tenderer driver quit failed: ${error}`);
                });
            }
        }
    })()
        .catch(async (error) => {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`gem tenderer crawl failed: ${message}`);
            if (runId) {
                await updateGemTenderScanRunById({
                    id: runId,
                    status: "failed",
                    tender_count: 0,
                    error_message: message,
                    finished_on: toDbDateTime(new Date()),
                });
            }
        })
        .finally(() => {
            processing = false;
        });

    return true;
}
