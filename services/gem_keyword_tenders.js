import {
    getGemKeywordTenderById,
    updateGemKeywordTenderById,
} from "../db/gem_keyword_tenders.js";

export async function updateGemKeywordTender({ params, body, set }) {
    const gemKeywordTender = await getGemKeywordTenderById({ id: params.id });
    if (!gemKeywordTender) {
        set.status = 404;
        return { error: "Tender not found" };
    }

    await updateGemKeywordTenderById({
        id: gemKeywordTender.id,
        hidden: body.hidden ?? gemKeywordTender.hidden,
        eligible: body.eligible ?? gemKeywordTender.eligible,
        filed: body.filed ?? gemKeywordTender.filed,
        quote: body.quote !== undefined ? body.quote : gemKeywordTender.quote,
    });

    const updatedGemKeywordTender = await getGemKeywordTenderById({ id: gemKeywordTender.id });
    set.status = 200;
    return { message: "Tender updated", gemKeywordTender: updatedGemKeywordTender };
}
