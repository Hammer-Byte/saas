import { filer, logger } from "@hammerbyte/utils";
import {
    getPendingTaskReminders,
    stampTaskReminderSentOn,
} from "../db/task_reminders.js";
import { TASK_STATE_LABELS, TASK_STATES } from "../constants.js";
import { getIstDateTime } from "./date.js";
import transporter from "./transporter.js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function publicBaseUrl() {
    return String(Bun.env.PUBLIC_BASE_URL || "https://hammerbyte.co.in").replace(/\/$/, "");
}

function taskUrl(taskId) {
    return `${publicBaseUrl()}/app/tasks/${Number(taskId)}`;
}

function stateLabel(state) {
    return TASK_STATE_LABELS[state] || state || TASK_STATE_LABELS[TASK_STATES.BACKLOG];
}

function sendTaskReminderEmail({ reminder }) {
    const recipient = String(
        reminder.recipient_personal_email || reminder.recipient_email || "",
    ).trim();
    if (!recipient) {
        logger.info(
            `task reminder skipped — no email for user #${reminder.recipient_user_id}`,
        );
        return false;
    }

    const recipientName =
        reminder.recipient_full_name || reminder.recipient_email || "there";

    const html = filer.prepareTemplated("templates/task_reminder.html", {
        recipient_name: recipientName,
        task_title: reminder.task_title || "—",
        task_state: stateLabel(reminder.task_state),
        task_end_at: reminder.task_end_at || "—",
        remind_at: reminder.remind_at || "—",
        record_id: reminder.task_id,
        task_url: taskUrl(reminder.task_id),
        app_name: "HammerByte",
    });

    transporter.transport({
        recipient,
        subject: `Task reminder — ${reminder.task_title || `Task #${reminder.task_id}`}`,
        body: html,
        html_enabled: true,
    });
    logger.info(
        `task reminder queued for ${recipient} (reminder #${reminder.id}, task #${reminder.task_id})`,
    );
    return true;
}

export async function checkTaskReminders() {
    try {
        const now = getIstDateTime();
        const pending = await getPendingTaskReminders({ now });
        if (!pending.length) {
            return;
        }

        for (const reminder of pending) {
            const sent = sendTaskReminderEmail({ reminder });
            if (!sent) {
                continue;
            }
            await stampTaskReminderSentOn({ id: reminder.id, sent_on: now });
        }
    } catch (error) {
        logger.error(`checkTaskReminders: ${error}`);
    }
}

export function startTaskReminderWatcher() {
    checkTaskReminders().catch((error) => {
        logger.error(`startTaskReminderWatcher initial: ${error}`);
    });
    setInterval(() => {
        checkTaskReminders().catch((error) => {
            logger.error(`startTaskReminderWatcher tick: ${error}`);
        });
    }, CHECK_INTERVAL_MS);
}
