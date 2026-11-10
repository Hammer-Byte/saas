import { filer, logger } from "@hammerbyte/utils";
import { INQUIRY_STATE_LABELS, INQUIRY_STATES } from "../constants.js";
import { getAllAdminUsers } from "../db/users.js";
import transporter from "./transporter.js";

function publicBaseUrl() {
    return String(Bun.env.PUBLIC_BASE_URL || "https://hammerbyte.co.in").replace(/\/$/, "");
}

function stateLabel(state) {
    return INQUIRY_STATE_LABELS[state] || state || INQUIRY_STATE_LABELS[INQUIRY_STATES.NEW];
}

function displaySource(source) {
    if (!source) return "website";
    return source;
}

function pushUniqueRecipient(recipientUsers, seenEmails, user) {
    const email = String(user?.email || "").trim();
    if (!email || seenEmails.has(email.toLowerCase())) return;
    seenEmails.add(email.toLowerCase());
    recipientUsers.push({
        email,
        name: user?.full_name || user?.email || "there",
    });
}

export async function notifyAdminsNewInquiry({ inquiry }) {
    try {
        const admins = await getAllAdminUsers();
        const recipientUsers = [];
        const seenEmails = new Set();
        for (const admin of admins || []) {
            pushUniqueRecipient(recipientUsers, seenEmails, admin);
        }

        if (!recipientUsers.length) {
            logger.error("notifyAdminsNewInquiry: no admin emails");
            return;
        }

        const detailUrl = `${publicBaseUrl()}/app/inquiries/${inquiry.id}`;
        for (const recipient of recipientUsers) {
            const html = filer.prepareTemplated("templates/inquiry_new_admin.html", {
                admin_name: recipient.name,
                full_name: inquiry.full_name || "—",
                phone: inquiry.phone || "—",
                email: inquiry.email || "—",
                source: displaySource(inquiry.source),
                record_id: inquiry.id,
                detail_url: detailUrl,
                app_name: "HammerByte",
            });
            transporter.transport({
                recipient: recipient.email,
                subject: `New inquiry #${inquiry.id} — ${inquiry.full_name || inquiry.phone}`,
                body: html,
                html_enabled: true,
            });
        }
        logger.info(`inquiry new-admin email queued for ${recipientUsers.length} admin(s)`);
    } catch (error) {
        logger.error(`notifyAdminsNewInquiry: ${error}`);
    }
}

export function notifyInquireeReceived({ inquiry }) {
    try {
        const recipient = String(inquiry?.email || "").trim();
        if (!recipient) {
            return;
        }

        const html = filer.prepareTemplated("templates/inquiry_received.html", {
            inquiree_name: inquiry.full_name || "there",
            record_id: inquiry.id,
            app_name: "HammerByte",
        });
        transporter.transport({
            recipient,
            subject: "We received your inquiry — HammerByte",
            body: html,
            html_enabled: true,
        });
        logger.info(`inquiry acknowledgement email queued for ${recipient}`);
    } catch (error) {
        logger.error(`notifyInquireeReceived: ${error}`);
    }
}

export function notifyInquiryAssigned({ inquiry, assigneeUser, assignedByUser }) {
    try {
        const recipient = String(assigneeUser?.email || "").trim();
        if (!recipient) {
            logger.error("notifyInquiryAssigned: assignee has no email");
            return;
        }

        const html = filer.prepareTemplated("templates/inquiry_assigned.html", {
            assignee_name: assigneeUser.full_name || assigneeUser.email || "there",
            assigned_by_name:
                assignedByUser?.full_name || assignedByUser?.email || "A teammate",
            full_name: inquiry.full_name || "—",
            phone: inquiry.phone || "—",
            email: inquiry.email || "—",
            state: stateLabel(inquiry.state),
            record_id: inquiry.id,
            detail_url: `${publicBaseUrl()}/app/inquiries/${inquiry.id}`,
            app_name: "HammerByte",
        });
        transporter.transport({
            recipient,
            subject: `Inquiry assigned — #${inquiry.id}`,
            body: html,
            html_enabled: true,
        });
        logger.info(`inquiry assignment email queued for ${recipient} (inquiry #${inquiry.id})`);
    } catch (error) {
        logger.error(`notifyInquiryAssigned: ${error}`);
    }
}

export async function notifyInquiryMissingFollowup({ inquiry, slot, dueLabel }) {
    try {
        const admins = await getAllAdminUsers();
        const recipientUsers = [];
        const seenEmails = new Set();
        for (const admin of admins || []) {
            pushUniqueRecipient(recipientUsers, seenEmails, admin);
        }
        if (inquiry.assignee_email || inquiry.assignee_full_name) {
            pushUniqueRecipient(recipientUsers, seenEmails, {
                email: inquiry.assignee_email,
                full_name: inquiry.assignee_full_name,
            });
        }

        if (!recipientUsers.length) {
            logger.error("notifyInquiryMissingFollowup: no recipients");
            return;
        }

        const detailUrl = `${publicBaseUrl()}/app/inquiries/${inquiry.id}`;
        for (const recipient of recipientUsers) {
            const html = filer.prepareTemplated("templates/inquiry_missing_followup.html", {
                recipient_name: recipient.name,
                full_name: inquiry.full_name || "—",
                phone: inquiry.phone || "—",
                slot: String(slot),
                due_label: dueLabel || `day offset for slot ${slot}`,
                record_id: inquiry.id,
                detail_url: detailUrl,
                app_name: "HammerByte",
            });
            transporter.transport({
                recipient: recipient.email,
                subject: `Missing follow-up #${slot} — inquiry #${inquiry.id}`,
                body: html,
                html_enabled: true,
            });
        }
        logger.info(
            `inquiry missing-followup email queued for inquiry #${inquiry.id} slot ${slot}`,
        );
    } catch (error) {
        logger.error(`notifyInquiryMissingFollowup: ${error}`);
    }
}
