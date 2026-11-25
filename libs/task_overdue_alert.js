import { logger } from "@hammerbyte/utils";
import { createTaskActivity } from "../db/task_activities.js";
import {
    getTasksPendingOverdueAlerts,
    stampTaskOverdueAlertSentOn,
} from "../db/tasks.js";
import { getIstDate, getIstDateTime, getSundayDate } from "./date.js";
import { notifyTaskOverdue } from "./task_notify.js";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const ALERT_EVERY_MS = 12 * 60 * 60 * 1000;

function alertCutoffIst() {
    return getIstDateTime(new Date(Date.now() - ALERT_EVERY_MS));
}

function overdueReason(task, today) {
    const reasons = [];
    if (task.end_at) {
        const endKey = String(task.end_at).slice(0, 19).replace("T", " ");
        const now = getIstDateTime();
        if (now && endKey < now) {
            reasons.push("End time has passed");
        }
    }
    if (task.sprint_week_start) {
        const sunday = getSundayDate(task.sprint_week_start);
        if (sunday && today && sunday < today) {
            reasons.push(`Sprint week ended (${sunday})`);
        }
    }
    return reasons.length ? reasons.join("; ") : "Timeline or sprint week has passed";
}

function recipientForTask(task) {
    if (task.assignee_user_id) {
        return {
            id: Number(task.assignee_user_id),
            full_name: task.assignee_full_name,
            email: task.assignee_email,
            personal_email: task.assignee_personal_email,
        };
    }
    return {
        id: Number(task.created_by_user_id),
        full_name: task.created_by_full_name,
        email: task.created_by_email,
        personal_email: task.created_by_personal_email,
    };
}

export async function checkTaskOverdueAlerts() {
    const now = getIstDateTime();
    const today = getIstDate();
    const alertCutoff = alertCutoffIst();
    if (!now || !today || !alertCutoff) {
        return;
    }

    const tasks = await getTasksPendingOverdueAlerts({
        now,
        today,
        alert_cutoff: alertCutoff,
    });
    if (!tasks.length) {
        return;
    }

    let sentCount = 0;
    for (const task of tasks) {
        const recipient = recipientForTask(task);
        if (!(recipient.id >= 1)) {
            continue;
        }

        const reasonLabel = overdueReason(task, today);
        const sent = notifyTaskOverdue({ task, recipientUser: recipient, reasonLabel });
        if (!sent) {
            continue;
        }

        await stampTaskOverdueAlertSentOn({ id: task.id, sent_on: now });
        await createTaskActivity({
            task_id: task.id,
            user_id: recipient.id,
            activity: `Overdue alert sent (${reasonLabel})`,
        });
        sentCount += 1;
    }

    if (sentCount) {
        logger.info(`task overdue alerts sent: ${sentCount}`);
    }
}

export function startTaskOverdueAlertWatcher() {
    checkTaskOverdueAlerts().catch((error) => {
        logger.error(`checkTaskOverdueAlerts initial: ${error}`);
    });

    setInterval(() => {
        checkTaskOverdueAlerts().catch((error) => {
            logger.error(`checkTaskOverdueAlerts: ${error}`);
        });
    }, CHECK_INTERVAL_MS);
}
