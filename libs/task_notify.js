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
    return TASK_STATE_LABELS[state] || state || TASK_STATE_LABELS[TASK_STATES.BACKLOG];
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

export function notifyTaskOverdue({ task, recipientUser, reasonLabel }) {
    try {
        const recipient = String(
            recipientUser?.personal_email || recipientUser?.email || "",
        ).trim();
        if (!recipient) {
            logger.error("notifyTaskOverdue: recipient has no email");
            return false;
        }

        const recipientName =
            recipientUser?.full_name || recipientUser?.email || "there";

        const html = filer.prepareTemplated("templates/task_overdue_alert.html", {
            recipient_name: recipientName,
            task_title: task.title || "—",
            task_state: stateLabel(task.state),
            task_priority: priorityLabel(task.priority),
            task_end_at: task.end_at || "—",
            overdue_reason: reasonLabel || "Timeline or sprint week has passed",
            record_id: task.id,
            task_url: taskUrl(task.id),
            app_name: "HammerByte",
        });

        transporter.transport({
            recipient,
            subject: `Overdue task — ${task.title || `#${task.id}`}`,
            body: html,
            html_enabled: true,
        });
        logger.info(`task overdue alert queued for ${recipient} (task #${task.id})`);
        return true;
    } catch (error) {
        logger.error(`notifyTaskOverdue: ${error}`);
        return false;
    }
}

export function notifyTaskReviewRequested({ task, reviewerUser, requestedByUser }) {
    try {
        const recipient = String(reviewerUser?.email || "").trim();
        if (!recipient) {
            logger.error("notifyTaskReviewRequested: reviewer has no email");
            return;
        }

        const reviewerName = reviewerUser.full_name || reviewerUser.email || "there";
        const requestedByName =
            requestedByUser?.full_name || requestedByUser?.email || "A teammate";

        const html = filer.prepareTemplated("templates/task_review_requested.html", {
            reviewer_name: reviewerName,
            requested_by_name: requestedByName,
            task_title: task.title || "—",
            task_state: stateLabel(task.state),
            task_priority: priorityLabel(task.priority),
            task_end_at: task.end_at || "—",
            assignee_name: task.assignee_full_name || task.assignee_email || "—",
            record_id: task.id,
            task_url: taskUrl(task.id),
            app_name: "HammerByte",
        });

        transporter.transport({
            recipient,
            subject: `Review requested — ${task.title || `#${task.id}`}`,
            body: html,
            html_enabled: true,
        });
        logger.info(
            `task review email queued for ${recipient} (task #${task.id})`,
        );
    } catch (error) {
        logger.error(`notifyTaskReviewRequested: ${error}`);
    }
}
