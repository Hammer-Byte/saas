import {
    createGemTenderKeyword,
    deleteGemTenderKeywordById,
    getAllGemTenderKeywords,
    getGemTenderKeywordById,
    getGemTenderKeywordByKeyword,
} from "../db/gem_tender_keywords.js";
import { getGemKeywordTendersByKeywordId } from "../db/gem_keyword_tenders.js";
import { crawlGemForTenders, processing } from "../libs/tenderer.js";

export async function addGemTenderKeyword({ body, set }) {
    const keyword = body.keyword.trim();
    if (!keyword) {
        set.status = 400;
        return { error: "Keyword is required" };
    }

    const existingKeyword = await getGemTenderKeywordByKeyword({ keyword });
    if (existingKeyword) {
        set.status = 409;
        return { error: "Keyword already exists" };
    }

    const id = await createGemTenderKeyword({ keyword });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create keyword" };
    }

    const gemTenderKeyword = await getGemTenderKeywordById({ id });

    set.status = 201;
    return { message: "Keyword created", gemTenderKeyword };
}

export async function deleteGemTenderKeyword({ params, set }) {
    const existingKeyword = await getGemTenderKeywordById({ id: params.id });
    if (!existingKeyword) {
        set.status = 404;
        return { error: "Keyword not found" };
    }

    await deleteGemTenderKeywordById({ id: existingKeyword.id });
    set.status = 204;
}

export async function getGemTenderKeywords({ set }) {
    const gemTenderKeywords = await getAllGemTenderKeywords();
    set.status = 200;
    return { gemTenderKeywords, processing };
}

export async function startGemTenderScan({ set }) {
    if (processing) {
        set.status = 409;
        return { error: "Scan already in progress", processing: true };
    }

    const gemTenderKeywords = await getAllGemTenderKeywords();
    if (!gemTenderKeywords.length) {
        set.status = 400;
        return { error: "No keywords to scan", processing: false };
    }

    const started = crawlGemForTenders({ keywords: gemTenderKeywords });
    if (!started) {
        set.status = 409;
        return { error: "Scan already in progress", processing: true };
    }

    set.status = 202;
    return { message: "Scan started", processing: true };
}

export async function getGemKeywordTenders({ params, query, set }) {
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
