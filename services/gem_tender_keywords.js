import { AUTHORITIES } from "../constants.js";
import {
    createGemTenderKeyword,
    deleteGemTenderKeywordById,
    getAllGemTenderKeywords,
    getGemTenderKeywordById,
    getGemTenderKeywordByKeyword,
    updateGemTenderKeywordById,
} from "../db/gem_tender_keywords.js";
import { getGemKeywordTendersByKeywordId } from "../db/gem_keyword_tenders.js";
import {
    createGemTenderScanRun,
    getGemTenderScanRunById,
} from "../db/gem_tender_scan_runs.js";
import { hasAuthority } from "../libs/app_page.js";
import { crawlGemForTenders, processing } from "../libs/tenderer.js";
import { getCurrentUser } from "./authentication.js";

function normalizeExactSearch(value) {
    return !!value;
}

async function requireGemTenderKeywordsAuthority({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return null;
    }
    if (!hasAuthority(currentUser.authorities, AUTHORITIES.USE_PAGE_GEM_TENDER_KEYWORDS)) {
        set.status = 403;
        return null;
    }
    return currentUser;
}

export async function addGemTenderKeyword({ body, cookie, set }) {
    if (!(await requireGemTenderKeywordsAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const keyword = body.keyword.trim();
    if (!keyword) {
        set.status = 400;
        return { error: "Keyword is required" };
    }

    const exact_search = normalizeExactSearch(body.exact_search);

    const existingKeyword = await getGemTenderKeywordByKeyword({ keyword });
    if (existingKeyword) {
        set.status = 409;
        return { error: "Keyword already exists" };
    }

    const id = await createGemTenderKeyword({ keyword, exact_search });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create keyword" };
    }

    const gemTenderKeyword = await getGemTenderKeywordById({ id });

    set.status = 201;
    return { message: "Keyword created", gemTenderKeyword };
}

export async function updateGemTenderKeyword({ params, body, cookie, set }) {
    if (!(await requireGemTenderKeywordsAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const existingKeyword = await getGemTenderKeywordById({ id: params.id });
    if (!existingKeyword) {
        set.status = 404;
        return { error: "Keyword not found" };
    }

    const keyword = body.keyword.trim();
    if (!keyword) {
        set.status = 400;
        return { error: "Keyword is required" };
    }

    const exact_search = normalizeExactSearch(body.exact_search);

    const duplicate = await getGemTenderKeywordByKeyword({ keyword });
    if (duplicate && Number(duplicate.id) !== Number(existingKeyword.id)) {
        set.status = 409;
        return { error: "Keyword already exists" };
    }

    await updateGemTenderKeywordById({
        id: existingKeyword.id,
        keyword,
        exact_search,
    });

    const gemTenderKeyword = await getGemTenderKeywordById({ id: existingKeyword.id });
    set.status = 200;
    return { message: "Keyword updated", gemTenderKeyword };
}

export async function deleteGemTenderKeyword({ params, cookie, set }) {
    if (!(await requireGemTenderKeywordsAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const existingKeyword = await getGemTenderKeywordById({ id: params.id });
    if (!existingKeyword) {
        set.status = 404;
        return { error: "Keyword not found" };
    }

    await deleteGemTenderKeywordById({ id: existingKeyword.id });
    set.status = 204;
}

export async function getGemTenderKeywords({ cookie, set }) {
    if (!(await requireGemTenderKeywordsAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const gemTenderKeywords = await getAllGemTenderKeywords();
    set.status = 200;
    return { gemTenderKeywords, processing };
}

export async function startGemTenderScan({ cookie, set }) {
    if (processing) {
        set.status = 409;
        return { error: "Scan already in progress", processing: true };
    }

    const currentUser = await requireGemTenderKeywordsAuthority({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
            processing: false,
        };
    }

    const gemTenderKeywords = await getAllGemTenderKeywords();
    if (!gemTenderKeywords.length) {
        set.status = 400;
        return { error: "No keywords to scan", processing: false };
    }

    const runId = await createGemTenderScanRun({
        keyword_count: gemTenderKeywords.length,
        created_by: currentUser.id,
    });
    if (!runId) {
        set.status = 400;
        return { error: "Failed to create scan run", processing: false };
    }

    const started = crawlGemForTenders({
        keywords: gemTenderKeywords,
        runId,
    });
    if (!started) {
        set.status = 409;
        return { error: "Scan already in progress", processing: true };
    }

    set.status = 202;
    return {
        message: "Scan started",
        processing: true,
        run: await getGemTenderScanRunById({ id: runId }),
    };
}

export async function getGemKeywordTenders({ params, query, cookie, set }) {
    if (!(await requireGemTenderKeywordsAuthority({ cookie, set }))) {
        return { error: set.status === 401 ? "Unauthorized" : "Missing authority" };
    }

    const existingKeyword = await getGemTenderKeywordById({ id: params.id });
    if (!existingKeyword) {
        set.status = 404;
        return { error: "Keyword not found" };
    }

    const month =
        query?.month && /^\d{4}-\d{2}$/.test(query.month)
            ? query.month
            : (() => {
                  const now = new Date();
                  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
              })();

    const gemKeywordTenders = await getGemKeywordTendersByKeywordId({
        keyword_id: existingKeyword.id,
        month,
    });

    set.status = 200;
    return {
        gemTenderKeyword: existingKeyword,
        gemKeywordTenders,
        month,
    };
}
