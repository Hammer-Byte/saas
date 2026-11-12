import { GEM_TENDER_SCAN_TYPES } from "../constants.js";
import { getGemCategoriesByIds } from "../db/gem_categories.js";
import { getGemScanKeywordsByIds } from "../db/gem_scan_keywords.js";
import {
    createGemTenderScanRun,
    getGemTenderScanRunById,
} from "../db/gem_tender_scan_runs.js";
import { crawlGemForTenders, processing } from "../libs/tenderer.js";
import { canUseGemCategories } from "./gem_categories.js";
import { getCurrentUser } from "./authentication.js";

async function requireScannerAuthority({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return null;
    }
    if (
        !canUseGemCategories(currentUser.authorities, {
            super_admin: currentUser.super_admin,
        })
    ) {
        set.status = 403;
        return null;
    }
    return currentUser;
}

/**
 * Queue: selected Direct Search keywords first, then Advance Search GEM categories.
 * One crawl run processes the full queue in order.
 */
export async function startGemScannerScan({ body, cookie, set }) {
    if (processing) {
        set.status = 409;
        return { error: "Scan already in progress", processing: true };
    }

    const currentUser = await requireScannerAuthority({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
            processing: false,
        };
    }

    const keywordIds = Array.isArray(body?.keyword_ids)
        ? [...new Set(body.keyword_ids.map((id) => Number(id)).filter((id) => id >= 1))]
        : [];
    const categoryIds = Array.isArray(body?.category_ids)
        ? [...new Set(body.category_ids.map((id) => Number(id)).filter((id) => id >= 1))]
        : [];

    if (!keywordIds.length && !categoryIds.length) {
        set.status = 400;
        return {
            error: "Select at least one keyword or GEM category to scan",
            processing: false,
        };
    }

    const crawlEntries = [];

    if (keywordIds.length) {
        const rows = await getGemScanKeywordsByIds({ ids: keywordIds });
        if (rows.length !== keywordIds.length) {
            set.status = 400;
            return { error: "One or more keywords are invalid", processing: false };
        }
        const missingCategory = rows.find((row) => !(Number(row.tender_category_id) >= 1));
        if (missingCategory) {
            set.status = 400;
            return {
                error: `Keyword “${missingCategory.keyword}” needs a HammerByte category`,
                processing: false,
            };
        }
        for (const row of rows) {
            crawlEntries.push({
                keyword: row.keyword,
                exact_search: !!Number(row.exact_search),
                tender_category_id: Number(row.tender_category_id),
                search_mode: "all_bids",
            });
        }
    }

    if (categoryIds.length) {
        const categories = await getGemCategoriesByIds({ ids: categoryIds });
        if (!categories.length) {
            set.status = 400;
            return { error: "No valid categories selected", processing: false };
        }
        const missingHb = categories.find(
            (category) => !(Number(category.tender_category_id) >= 1),
        );
        if (missingHb) {
            set.status = 400;
            return {
                error: `Group for “${missingHb.name}” needs a HammerByte category before scanning`,
                processing: false,
            };
        }
        for (const category of categories) {
            crawlEntries.push({
                keyword: category.name,
                exact_search: false,
                category_group_id: Number(category.group_id),
                tender_category_id: Number(category.tender_category_id),
                search_mode: "advance_search",
            });
        }
    }

    let scanType = GEM_TENDER_SCAN_TYPES.COMBINED;
    if (keywordIds.length && !categoryIds.length) {
        scanType = GEM_TENDER_SCAN_TYPES.DIRECT_SEARCH;
    } else if (!keywordIds.length && categoryIds.length) {
        scanType = GEM_TENDER_SCAN_TYPES.ADVANCE_SEARCH;
    }

    const runId = await createGemTenderScanRun({
        keyword_count: crawlEntries.length,
        created_by: currentUser.id,
        scan_type: scanType,
    });
    if (!runId) {
        set.status = 400;
        return { error: "Failed to create scan run", processing: false };
    }

    const started = crawlGemForTenders({
        keywords: crawlEntries,
        runId,
    });
    if (!started) {
        set.status = 409;
        return { error: "Scan already in progress", processing: true };
    }

    const parts = [];
    if (keywordIds.length) {
        parts.push(
            `${keywordIds.length} keyword${keywordIds.length === 1 ? "" : "s"}`,
        );
    }
    if (categoryIds.length) {
        parts.push(
            `${categoryIds.length} categor${categoryIds.length === 1 ? "y" : "ies"}`,
        );
    }

    set.status = 202;
    return {
        message: `Scan started for ${parts.join(" then ")}`,
        processing: true,
        keyword_count: keywordIds.length,
        category_count: categoryIds.length,
        queue_count: crawlEntries.length,
        run: await getGemTenderScanRunById({ id: runId }),
    };
}
