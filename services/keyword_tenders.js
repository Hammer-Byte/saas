import {
    getGemKeywordTenderById,
    updateGemKeywordTenderById,
} from "../db/gem_keyword_tenders.js";

export async function updateKeywordTender({ params, body, set }) {
    const tender = await getGemKeywordTenderById({ id: params.id });
    if (!tender) {
        set.status = 404;
        return { error: "Tender not found" };
    }

    await updateGemKeywordTenderById({
        id: tender.id,
        hidden: !!body.hidden,
    });

    const keywordTender = await getGemKeywordTenderById({ id: tender.id });
    set.status = 200;
    return { message: "Tender updated", keywordTender };
}
