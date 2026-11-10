import { logger } from "@hammerbyte/utils";
import { INQUIRY_FOLLOWUP_DAY_OFFSETS } from "../constants.js";
import {
    getInquiriesPendingFollowupReminders,
    stampInquiryFollowupReminder,
} from "../db/inquiries.js";
import { notifyInquiryMissingFollowup } from "./inquiry_notify.js";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

function parseFollowupSlots(value) {
    if (!value) return new Set();
    return new Set(
        String(value)
            .split(",")
            .map((part) => Number(part.trim()))
            .filter((slot) => slot >= 1 && slot <= 3),
    );
}

function reminderStampForSlot(inquiry, slot) {
    if (slot === 1) return inquiry.followup_1_reminder_sent_on;
    if (slot === 2) return inquiry.followup_2_reminder_sent_on;
    return inquiry.followup_3_reminder_sent_on;
}

function daysSincePotential(potentialEnteredOn, now) {
    const entered = new Date(potentialEnteredOn);
    if (Number.isNaN(entered.getTime())) return 0;
    const diffMs = now.getTime() - entered.getTime();
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export async function checkInquiryFollowupReminders() {
    const inquiries = await getInquiriesPendingFollowupReminders();
    if (!inquiries.length) {
        return;
    }

    const now = new Date();
    let sentCount = 0;

    for (const inquiry of inquiries) {
        const completedSlots = parseFollowupSlots(inquiry.followup_slots);
        const daysElapsed = daysSincePotential(inquiry.potential_entered_on, now);

        for (const slot of [1, 2, 3]) {
            const dayOffset = INQUIRY_FOLLOWUP_DAY_OFFSETS[slot];
            if (daysElapsed < dayOffset) {
                continue;
            }
            if (completedSlots.has(slot)) {
                continue;
            }
            if (reminderStampForSlot(inquiry, slot)) {
                continue;
            }

            await notifyInquiryMissingFollowup({
                inquiry,
                slot,
                dueLabel: `day ${dayOffset}`,
            });
            await stampInquiryFollowupReminder({ id: inquiry.id, slot });
            sentCount += 1;
        }
    }

    if (sentCount) {
        logger.info(`inquiry follow-up reminders sent: ${sentCount}`);
    }
}

export function startInquiryFollowupReminderWatcher() {
    checkInquiryFollowupReminders().catch((error) => {
        logger.error(`checkInquiryFollowupReminders initial: ${error}`);
    });

    setInterval(() => {
        checkInquiryFollowupReminders().catch((error) => {
            logger.error(`checkInquiryFollowupReminders: ${error}`);
        });
    }, CHECK_INTERVAL_MS);
}
