import { enqueueSeleniumJob } from "./pipeline.js";

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
