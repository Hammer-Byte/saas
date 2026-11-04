import { filer, logger } from "@hammerbyte/utils";
import {
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    GEM_KEYWORD_TENDER_STAGES,
} from "../constants.js";
import transporter from "./transporter.js";

function stageLabel(stage) {
    return (
        GEM_KEYWORD_TENDER_STAGE_LABELS[stage] ||
        stage ||
        GEM_KEYWORD_TENDER_STAGE_LABELS[GEM_KEYWORD_TENDER_STAGES.NEW]
    );
}

export function notifyGemKeywordTenderAssigned({
    tender,
    assigneeUser,
    assignedByUser,
}) {
    try {
        const recipient = String(assigneeUser?.email || "").trim();
        if (!recipient) {
            logger.error("notifyGemKeywordTenderAssigned: assignee has no email");
            return;
        }

        const assigneeName = assigneeUser.full_name || assigneeUser.email || "there";
        const assignedByName =
            assignedByUser?.full_name || assignedByUser?.email || "A teammate";

        const html = filer.prepareTemplated("templates/gem_tender_assigned.html", {
            assignee_name: assigneeName,
            assigned_by_name: assignedByName,
            tender_id: tender.tender_id || "—",
            keyword: tender.keyword || "—",
            stage: stageLabel(tender.stage),
            end_date_time: tender.end_date_time || "—",
            record_id: tender.id,
            app_name: "HammerByte",
        });

        transporter.transport({
            recipient,
            subject: `GEM tender assigned — ${tender.tender_id || `#${tender.id}`}`,
            body: html,
            html_enabled: true,
        });
        logger.info(
            `gem tender assignment email queued for ${recipient} (tender #${tender.id})`,
        );
    } catch (error) {
        logger.error(`notifyGemKeywordTenderAssigned: ${error}`);
    }
}
