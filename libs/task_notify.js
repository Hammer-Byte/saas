import { filer, logger } from "@hammerbyte/utils";
import { TASK_PRIORITY_LABELS, TASK_STATE_LABELS, TASK_STATES } from "../constants.js";
import transporter from "./transporter.js";

function publicBaseUrl() {
    return String(Bun.env.PUBLIC_BASE_URL || "https://hammerbyte.co.in").replace(/\/$/, "");
}

function taskUrl(taskId) {
    return `${publicBaseUrl()}/app/tasks/${Number(taskId)}`;
}

function stateLabel(state) {
    return TASK_STATE_LABELS[state] || state || TASK_STATE_LABELS[TASK_STATES.TODO];
}

function priorityLabel(priority) {
    return TASK_PRIORITY_LABELS[priority] || priority || "—";
}

export function notifyTaskAssigned({ task, assigneeUser, assignedByUser }) {
    try {
        const recipient = String(assigneeUser?.email || "").trim();
        if (!recipient) {
            logger.error("notifyTaskAssigned: assignee has no email");
            return;
        }

        const assigneeName = assigneeUser.full_name || assigneeUser.email || "there";
        const assignedByName =
            assignedByUser?.full_name || assignedByUser?.email || "A teammate";

        const html = filer.prepareTemplated("templates/task_assigned.html", {
            assignee_name: assigneeName,
            assigned_by_name: assignedByName,
            task_title: task.title || "—",
            task_state: stateLabel(task.state),
            task_priority: priorityLabel(task.priority),
            task_end_at: task.end_at || "—",
            record_id: task.id,
            task_url: taskUrl(task.id),
            app_name: "HammerByte",
        });

        transporter.transport({
            recipient,
            subject: `Task assigned — ${task.title || `#${task.id}`}`,
            body: html,
            html_enabled: true,
        });
        logger.info(
            `task assignment email queued for ${recipient} (task #${task.id})`,
        );
    } catch (error) {
        logger.error(`notifyTaskAssigned: ${error}`);
    }
}

export function notifyTaskFollowers({ task, followers, subject, message, actorUser }) {
    try {
        const actorId = Number(actorUser?.id);
        const taskTitle = task.title || `Task #${task.id}`;
        const html = filer.prepareTemplated("templates/task_update.html", {
            task_title: taskTitle,
            task_state: stateLabel(task.state),
            task_priority: priorityLabel(task.priority),
            update_message: message || "—",
            record_id: task.id,
            task_url: taskUrl(task.id),
            app_name: "HammerByte",
        });

        for (const follower of followers || []) {
            if (Number(follower.user_id) === actorId) {
                continue;
            }
            const recipient = String(
                follower.user_personal_email || follower.user_email || follower.personal_email || follower.email || "",
            ).trim();
            if (!recipient) {
                logger.info(
                    `notifyTaskFollowers: skipped follower user #${follower.user_id} — no email`,
                );
                continue;
            }

            transporter.transport({
                recipient,
                subject: subject || `Task update — ${taskTitle}`,
                body: html,
                html_enabled: true,
            });
            logger.info(
                `task follower email queued for ${recipient} (task #${task.id})`,
            );
        }
    } catch (error) {
        logger.error(`notifyTaskFollowers: ${error}`);
    }
}
