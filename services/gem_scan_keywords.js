import { GEM_TENDER_SCAN_TYPES } from "../constants.js";
import {
    createGemScanKeyword,
    deleteGemScanKeywordById,
    getAllGemScanKeywords,
    getGemScanKeywordById,
    getGemScanKeywordsByIds,
    updateGemScanKeywordById,
} from "../db/gem_scan_keywords.js";
import { getGemTenderCategoryById } from "../db/gem_tender_categories.js";
import {
    createGemTenderScanRun,
    getGemTenderScanRunById,
} from "../db/gem_tender_scan_runs.js";
import { enqueueGemScanJob } from "../libs/selenium/enqueue_gem.js";
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

function asKeyword(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ");
}

export async function listGemScanKeywords({ cookie, set }) {
    if (!(await requireScannerAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }
    set.status = 200;
    return { keywords: await getAllGemScanKeywords() };
}

export async function addGemScanKeyword({ body, cookie, set }) {
    if (!(await requireScannerAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const keyword = asKeyword(body?.keyword);
    if (!keyword) {
        set.status = 400;
        return { error: "Keyword is required" };
    }

    const tenderCategoryId = Number(body?.tender_category_id);
    if (!(tenderCategoryId >= 1)) {
        set.status = 400;
        return { error: "HammerByte category is required" };
    }
    const category = await getGemTenderCategoryById({ id: tenderCategoryId });
    if (!category) {
        set.status = 400;
        return { error: "HammerByte category not found" };
    }

    const id = await createGemScanKeyword({
        keyword,
        exact_search: !!body?.exact_search,
        tender_category_id: tenderCategoryId,
    });
    if (!id) {
        set.status = 409;
        return { error: "Failed to create keyword (duplicate?)" };
    }

    set.status = 201;
    return {
        message: "Keyword created",
        keyword: await getGemScanKeywordById({ id }),
    };
}

export async function updateGemScanKeyword({ params, body, cookie, set }) {
    if (!(await requireScannerAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const existing = await getGemScanKeywordById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Keyword not found" };
    }

    const keyword = asKeyword(body?.keyword);
    if (!keyword) {
        set.status = 400;
        return { error: "Keyword is required" };
    }

    const tenderCategoryId = Number(body?.tender_category_id);
    if (!(tenderCategoryId >= 1)) {
        set.status = 400;
        return { error: "HammerByte category is required" };
    }
    const category = await getGemTenderCategoryById({ id: tenderCategoryId });
    if (!category) {
        set.status = 400;
        return { error: "HammerByte category not found" };
    }

    await updateGemScanKeywordById({
        id: existing.id,
        keyword,
        exact_search: !!body?.exact_search,
        tender_category_id: tenderCategoryId,
    });

    set.status = 200;
    return {
        message: "Keyword updated",
        keyword: await getGemScanKeywordById({ id: existing.id }),
    };
}

export async function deleteGemScanKeyword({ params, cookie, set }) {
    if (!(await requireScannerAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const existing = await getGemScanKeywordById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Keyword not found" };
    }

    await deleteGemScanKeywordById({ id: existing.id });
    set.status = 204;
}

export async function startGemScanKeywordScan({ body, cookie, set }) {
    const currentUser = await requireScannerAuthority({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
            processing: false,
        };
    }

    const selectedIds = Array.isArray(body?.keyword_ids)
        ? [...new Set(body.keyword_ids.map((id) => Number(id)).filter((id) => id >= 1))]
        : [];
    if (!selectedIds.length) {
        set.status = 400;
        return { error: "Select at least one keyword to scan", processing: false };
    }

    const rows = await getGemScanKeywordsByIds({ ids: selectedIds });
    if (!rows.length) {
        set.status = 400;
        return { error: "No valid keywords selected", processing: false };
    }

    const missingCategory = rows.find(
        (row) => !(Number(row.tender_category_id) >= 1),
    );
    if (missingCategory) {
        set.status = 400;
        return {
            error: `Keyword “${missingCategory.keyword}” needs a HammerByte category`,
            processing: false,
        };
    }

    const keywords = rows.map((row) => ({
        keyword: row.keyword,
        exact_search: !!Number(row.exact_search),
        tender_category_id: Number(row.tender_category_id),
        search_mode: "all_bids",
    }));

    const runId = await createGemTenderScanRun({
        keyword_count: keywords.length,
        created_by: currentUser.id,
        scan_type: GEM_TENDER_SCAN_TYPES.DIRECT_SEARCH,
    });
    if (!runId) {
        set.status = 400;
        return { error: "Failed to create scan run", processing: false };
    }

    const job = await enqueueGemScanJob({
        runId,
        keywords,
        createdBy: currentUser.id,
        title: `GeM keyword scan (${keywords.length})`,
    });
    if (!job) {
        set.status = 400;
        return { error: "Failed to enqueue selenium job", processing: false };
    }

    set.status = 202;
    return {
        message: `Scan queued for ${keywords.length} keyword${keywords.length === 1 ? "" : "s"}`,
        processing: true,
        job_id: job.id,
        keyword_count: keywords.length,
        run: await getGemTenderScanRunById({ id: runId }),
    };
}
