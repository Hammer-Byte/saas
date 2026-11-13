import { filer, logger } from "@hammerbyte/utils";
import {
    getGemTendersPendingEligibilityReminder,
    stampGemTenderEligibilityReminders,
} from "../db/gem_tenders.js";
import { getIstDateTime, getReadableDate } from "./date.js";
import transporter from "./transporter.js";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const REMINDER_EVERY_MS = 6 * 60 * 60 * 1000;

function publicBaseUrl() {
    return String(Bun.env.PUBLIC_BASE_URL || "https://hammerbyte.co.in").replace(/\/$/, "");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function buildTendersHtml(tenders) {
    const baseUrl = publicBaseUrl();
    const rows = tenders
        .map((tender, index) => {
            const tenderId = escapeHtml(tender.tender_id || `#${tender.id}`);
            const categoryGroupName = escapeHtml(tender.category_group_name || "—");
            const endDate = escapeHtml(
                getReadableDate("DD/MM/YYYY HH:mm:ss", tender.end_date_time) ||
                    tender.end_date_time ||
                    "—",
            );
            const detailUrl = `${baseUrl}/app/gem-tenders/${Number(tender.id)}`;
            return `<div style="padding:8px 0;${index ? "border-top:1px solid #e5e7eb;" : ""}">
        <div><strong>${index + 1}. ${tenderId}</strong></div>
        <div>Group: ${categoryGroupName}</div>
        <div>End: ${endDate}</div>
        <div><a href="${escapeHtml(detailUrl)}" style="color:#2563eb;">Open tender</a></div>
      </div>`;
        })
        .join("");
    return rows || "<div>No tenders</div>";
}

function groupByAssignee(tenders) {
    const groups = new Map();
    for (const tender of tenders) {
        const assigneeId = Number(tender.assignee_user_id);
        if (!(assigneeId >= 1)) continue;
        if (!groups.has(assigneeId)) {
            groups.set(assigneeId, {
                assignee_user_id: assigneeId,
                assignee_full_name: tender.assignee_full_name,
                assignee_email: tender.assignee_email,
                assignee_personal_email: tender.assignee_personal_email,
                tenders: [],
            });
        }
        groups.get(assigneeId).tenders.push(tender);
    }
    return [...groups.values()];
}

function sendEligibilityReminder({ group }) {
    const recipient = String(group.assignee_personal_email || "").trim();
    if (!recipient) {
        logger.info(
            `gem eligibility reminder skipped — no personal_email for user #${group.assignee_user_id}`,
        );
        return false;
    }

    const assigneeName =
        group.assignee_full_name || group.assignee_email || "there";
    const tenderCount = group.tenders.length;
    const html = filer.prepareTemplated("templates/gem_tender_eligibility_pending.html", {
        assignee_name: assigneeName,
        tender_count: String(tenderCount),
        tenders_html: buildTendersHtml(group.tenders),
        app_name: "HammerByte",
    });

    const subjectIds = group.tenders
        .slice(0, 3)
        .map((tender) => tender.tender_id || `#${tender.id}`)
        .join(", ");
    const more =
        tenderCount > 3 ? ` (+${tenderCount - 3} more)` : "";

    transporter.transport({
        recipient,
        subject: `${tenderCount} GEM tender(s) pending eligibility — ${subjectIds}${more}`,
        body: html,
        html_enabled: true,
    });
    logger.info(
        `gem eligibility reminder queued for ${recipient} (${tenderCount} tender(s), user #${group.assignee_user_id})`,
    );
    return true;
}

export async function checkGemTenderEligibilityReminders() {
    try {
        const cutoff = new Date(Date.now() - REMINDER_EVERY_MS);
        const pending = await getGemTendersPendingEligibilityReminder({
            older_than_datetime: cutoff,
        });
        if (!pending.length) {
            return;
        }

        const groups = groupByAssignee(pending);
        const stampedOn = getIstDateTime();

        for (const group of groups) {
            const sent = sendEligibilityReminder({ group });
            if (!sent) continue;
            await stampGemTenderEligibilityReminders({
                ids: group.tenders.map((tender) => tender.id),
                sent_on: stampedOn,
            });
        }
    } catch (error) {
        logger.error(`checkGemTenderEligibilityReminders: ${error}`);
    }
}

export function startGemTenderEligibilityReminderWatcher() {
    checkGemTenderEligibilityReminders().catch((error) => {
        logger.error(`startGemTenderEligibilityReminderWatcher initial: ${error}`);
    });
    setInterval(() => {
        checkGemTenderEligibilityReminders().catch((error) => {
            logger.error(`startGemTenderEligibilityReminderWatcher tick: ${error}`);
        });
    }, CHECK_INTERVAL_MS);
}
