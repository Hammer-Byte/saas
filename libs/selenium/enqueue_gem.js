import { enqueueSeleniumJob } from "./pipeline.js";

export async function enqueueGemScanJob({
    runId,
    keywords,
    createdBy = null,
    title = null,
}) {
    const keywordCount = Array.isArray(keywords) ? keywords.length : 0;
    return await enqueueSeleniumJob({
        type: "gem_scan",
        source: "gem",
        title: title || `GeM scan (${keywordCount} keyword${keywordCount === 1 ? "" : "s"})`,
        payload: {
            runId,
            keywords,
        },
        created_by: createdBy,
        domain_run_id: runId,
    });
}
