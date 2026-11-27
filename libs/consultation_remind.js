import { logger } from "@hammerbyte/utils";
import {
    getPendingConsultationReminders,
    stampConsultationBookingReminderSentOn,
} from "../db/consultation_bookings.js";
import { getConsultationSettings } from "../db/consultation_settings.js";
import { getIstDateTime } from "./date.js";
import { sendConsultationReminderEmails } from "./consultation_notify.js";

const CHECK_INTERVAL_MS = 60 * 1000;

export async function checkConsultationReminders() {
    try {
        const now = getIstDateTime();
        if (!now) {
            return;
        }

        const pending = await getPendingConsultationReminders({ now });
        if (!pending.length) {
            return;
        }

        const settings = await getConsultationSettings();
        const meeting_link = settings?.meeting_link || "";

        for (const booking of pending) {
            const sent = sendConsultationReminderEmails({ booking, meeting_link });
            if (!sent) {
                continue;
            }
            await stampConsultationBookingReminderSentOn({
                id: booking.id,
                sent_on: now,
            });
            logger.info(`consultation reminder stamped for booking #${booking.id}`);
        }
    } catch (error) {
        logger.error(`checkConsultationReminders: ${error}`);
    }
}

export function startConsultationReminderWatcher() {
    checkConsultationReminders().catch((error) => {
        logger.error(`startConsultationReminderWatcher initial: ${error}`);
    });
    setInterval(() => {
        checkConsultationReminders().catch((error) => {
            logger.error(`startConsultationReminderWatcher tick: ${error}`);
        });
    }, CHECK_INTERVAL_MS);
}
