import { TASK_STATES } from "../constants.js";

const ALLOWED_TRANSITIONS = {
    [TASK_STATES.BACKLOG]: new Set([TASK_STATES.ANALYZING, TASK_STATES.IN_PROGRESS]),
    [TASK_STATES.ANALYZING]: new Set([
        TASK_STATES.BACKLOG,
        TASK_STATES.IN_PROGRESS,
        TASK_STATES.UNDER_REVIEW,
    ]),
    [TASK_STATES.IN_PROGRESS]: new Set([
        TASK_STATES.BACKLOG,
        TASK_STATES.ANALYZING,
        TASK_STATES.UNDER_REVIEW,
    ]),
    [TASK_STATES.UNDER_REVIEW]: new Set([TASK_STATES.IN_PROGRESS, TASK_STATES.DONE]),
    [TASK_STATES.DONE]: new Set([
        TASK_STATES.BACKLOG,
        TASK_STATES.ANALYZING,
        TASK_STATES.IN_PROGRESS,
        TASK_STATES.UNDER_REVIEW,
    ]),
};

function optionalUserId(value) {
    if (value == null || value === "") {
        return null;
    }
    const userId = Number(value);
    return userId >= 1 ? userId : null;
}

export function isTaskAdminUser(currentUser) {
    if (!currentUser) {
        return false;
    }
    if (currentUser.super_admin) {
        return true;
    }
    const roles = Array.isArray(currentUser.roles) ? currentUser.roles : [];
    return roles.includes("ADMIN");
}

export function canUserMoveTask({ task, currentUser }) {
    if (!task || !currentUser?.id) {
        return false;
    }
    if (isTaskAdminUser(currentUser)) {
        return true;
    }
    const currentUserId = Number(currentUser.id);
    const assigneeUserId = optionalUserId(task.assignee_user_id);
    const reviewerUserId = optionalUserId(task.reviewer_user_id);
    if (assigneeUserId != null && currentUserId === assigneeUserId) {
        return true;
    }
    if (reviewerUserId != null && currentUserId === reviewerUserId) {
        return true;
    }
    return false;
}

/**
 * Validate a board/state transition and return required field updates.
 */
export function resolveTaskStateTransition({
    task,
    nextState,
    currentUser,
    assignee_user_id,
    reviewer_user_id,
    comment,
}) {
    if (!task) {
        return { error: "Task not found", code: "not_found" };
    }

    const previousState = task.state || TASK_STATES.BACKLOG;
    if (previousState === nextState) {
        return {
            assigneeUserId: optionalUserId(task.assignee_user_id),
            reviewerUserId: optionalUserId(task.reviewer_user_id),
            requireComment: false,
            notifyReviewer: false,
        };
    }

    const isAdmin = isTaskAdminUser(currentUser);
    if (!canUserMoveTask({ task, currentUser })) {
        return {
            error: "Only the assignee, reviewer, or an admin can move this task",
            code: "move_forbidden",
        };
    }

    const allowed = ALLOWED_TRANSITIONS[previousState];
    if (!allowed || !allowed.has(nextState)) {
        return {
            error: `Cannot move from ${previousState} to ${nextState}`,
            code: "invalid_transition",
        };
    }

    let assigneeUserId = optionalUserId(task.assignee_user_id);
    const requestedAssignee = optionalUserId(assignee_user_id);
    if (requestedAssignee != null) {
        assigneeUserId = requestedAssignee;
    }

    let reviewerUserId = optionalUserId(task.reviewer_user_id);
    const requestedReviewer = optionalUserId(reviewer_user_id);
    if (requestedReviewer != null) {
        reviewerUserId = requestedReviewer;
    }

    const currentUserId = Number(currentUser?.id || 0);
    const isAssignee = currentUserId >= 1 && currentUserId === Number(assigneeUserId);
    const isReviewer = currentUserId >= 1 && currentUserId === Number(reviewerUserId);

    const needsAssignee =
        nextState === TASK_STATES.ANALYZING ||
        nextState === TASK_STATES.IN_PROGRESS ||
        (previousState === TASK_STATES.BACKLOG &&
            (nextState === TASK_STATES.ANALYZING || nextState === TASK_STATES.IN_PROGRESS)) ||
        (previousState === TASK_STATES.DONE &&
            (nextState === TASK_STATES.ANALYZING || nextState === TASK_STATES.IN_PROGRESS));

    if (needsAssignee && !(assigneeUserId >= 1)) {
        return { error: "Assignee is required for this state", code: "assignee_required" };
    }

    if (nextState === TASK_STATES.UNDER_REVIEW) {
        if (
            previousState !== TASK_STATES.ANALYZING &&
            previousState !== TASK_STATES.IN_PROGRESS &&
            previousState !== TASK_STATES.DONE
        ) {
            return {
                error: "Under review can only be reached from analyzing or in progress",
                code: "invalid_transition",
            };
        }
        if (!(reviewerUserId >= 1)) {
            return { error: "Reviewer is required for under review", code: "reviewer_required" };
        }
        if (!(assigneeUserId >= 1)) {
            return { error: "Assignee is required before review", code: "assignee_required" };
        }
        return {
            assigneeUserId,
            reviewerUserId,
            requireComment: false,
            notifyReviewer: previousState !== TASK_STATES.UNDER_REVIEW,
        };
    }

    if (
        previousState === TASK_STATES.UNDER_REVIEW &&
        nextState === TASK_STATES.IN_PROGRESS
    ) {
        // Admin or reviewer sending back must leave a comment.
        // Assignee (and not acting as admin/reviewer) may send back without comment.
        if (isAdmin || isReviewer) {
            const commentText = String(comment || "").trim();
            if (!commentText) {
                return {
                    error: "Admin or reviewer must leave a comment when sending back to in progress",
                    code: "comment_required",
                };
            }
            return {
                assigneeUserId,
                reviewerUserId,
                requireComment: true,
                comment: commentText,
                notifyReviewer: false,
            };
        }
        if (!isAssignee) {
            return {
                error: "Only the assignee, reviewer, or an admin can move this task",
                code: "move_forbidden",
            };
        }
        return {
            assigneeUserId,
            reviewerUserId,
            requireComment: false,
            notifyReviewer: false,
        };
    }

    if (previousState === TASK_STATES.UNDER_REVIEW && nextState === TASK_STATES.DONE) {
        if (!isReviewer && !isAdmin) {
            return {
                error: "Only the reviewer or an admin can move a task from under review to done",
                code: "reviewer_only",
            };
        }
        return {
            assigneeUserId,
            reviewerUserId,
            requireComment: false,
            notifyReviewer: false,
        };
    }

    return {
        assigneeUserId,
        reviewerUserId,
        requireComment: false,
        notifyReviewer: false,
    };
}
