import { filer, logger } from "@hammerbyte/utils";
import {
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    GEM_KEYWORD_TENDER_STAGES,
} from "../constants.js";
import { getAllSuperAdminUsers } from "../db/users.js";
import { getReadableDate } from "./date.js";
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
            category_group_name: tender.category_group_name || "—",
            stage: stageLabel(tender.stage),
            end_date_time:
                getReadableDate("DD/MM/YYYY HH:mm:ss", tender.end_date_time) || "—",
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

export async function notifyGemKeywordTenderQuoteRequested({
    tender,
    requestedByUser,
    assigneeUser,
}) {
    try {
        const superAdmins = await getAllSuperAdminUsers();
        const recipientUsers = [];
        const seenEmails = new Set();

        const pushRecipient = (user) => {
            const email = String(user?.email || "").trim();
            if (!email || seenEmails.has(email.toLowerCase())) return;
            seenEmails.add(email.toLowerCase());
            recipientUsers.push({
                email,
                name: user?.full_name || user?.email || "there",
            });
        };

        for (const admin of superAdmins || []) {
            pushRecipient(admin);
        }
        pushRecipient(assigneeUser);

        if (!recipientUsers.length) {
            logger.error(
                "notifyGemKeywordTenderQuoteRequested: no assignee or super admin emails",
            );
            return;
        }

        const requestedByName =
            requestedByUser?.full_name || requestedByUser?.email || "A teammate";
        const assigneeName = assigneeUser
            ? assigneeUser.full_name || assigneeUser.email || `User #${assigneeUser.id}`
            : "Unassigned";

        for (const recipient of recipientUsers) {
            const html = filer.prepareTemplated("templates/gem_tender_quote_request.html", {
                recipient_name: recipient.name,
                requested_by_name: requestedByName,
                assignee_name: assigneeName,
                tender_id: tender.tender_id || "—",
                category_group_name: tender.category_group_name || "—",
                end_date_time:
                    getReadableDate("DD/MM/YYYY HH:mm:ss", tender.end_date_time) ||
                    "—",
                record_id: tender.id,
                app_name: "HammerByte",
            });

            transporter.transport({
                recipient: recipient.email,
                subject: `Quote requested — GEM tender ${tender.tender_id || `#${tender.id}`}`,
                body: html,
                html_enabled: true,
            });
        }

        logger.info(
            `gem tender quote request emailed to ${recipientUsers.length} recipient(s) (tender #${tender.id})`,
        );
    } catch (error) {
        logger.error(`notifyGemKeywordTenderQuoteRequested: ${error}`);
    }
}
