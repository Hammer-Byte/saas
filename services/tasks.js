import {
    TASK_PRIORITIES,
    TASK_PRIORITY_LABELS,
    TASK_STATE_LABELS,
    TASK_STATES,
} from "../constants.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import { getCustomerInvoiceById } from "../db/customer_invoices.js";
import { createInvoiceItem } from "../db/invoice_items.js";
import {
    createTask,
    deleteTaskById,
    getTaskById,
    updateTaskById,
    updateTaskChargeById,
    updateTaskInvoiceLinkById,
    updateTaskStateById,
} from "../db/tasks.js";
import { createTaskActivity } from "../db/task_activities.js";
import { getUserById } from "../db/users.js";
import {
    getIstDateTime,
    getMondayDate,
    getSundayDate,
    normalizeSprintWeekStart,
    toDbDateTime,
} from "../libs/date.js";
import { notifyTaskAssigned, notifyTaskReviewRequested } from "../libs/task_notify.js";
import {
    canUserMoveTask,
    isTaskAdminUser,
    resolveTaskStateTransition,
} from "../libs/task_workflow.js";
import { createTaskComment } from "../db/task_comments.js";
import { updateCustomerInvoiceTotal } from "./customer_invoices.js";
import { getCurrentUser } from "./authentication.js";

function transitionHttpStatus(code) {
    if (code === "reviewer_only" || code === "move_forbidden") {
        return 403;
    }
    return 400;
}

const STATE_VALUES = new Set(Object.values(TASK_STATES));
const PRIORITY_VALUES = new Set(Object.values(TASK_PRIORITIES));

function stateLabel(state) {
    return TASK_STATE_LABELS[state] || state || "—";
}

function priorityLabel(priority) {
    return TASK_PRIORITY_LABELS[priority] || priority || "—";
}

function trimmedOrNull(value) {
    if (value == null || value === "") {
        return null;
    }
    const text = String(value).trim();
    return text || null;
}

const TASK_HOURS_MAX = 8;

function normalizeHours(value) {
    if (value == null || value === "") {
        return null;
    }
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
}

function validateTaskHours(value, label) {
    const hours = normalizeHours(value);
    if (hours == null) {
        return { hours: null };
    }
    if (hours < 0) {
        return { error: `${label} cannot be negative` };
    }
    if (hours > TASK_HOURS_MAX) {
        return { error: `${label} cannot be more than ${TASK_HOURS_MAX} hours` };
    }
    return { hours };
}

function normalizeMoney(value, label) {
    if (value == null || value === "") {
        return { amount: null };
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        return { error: `${label} must be a non-negative number` };
    }
    return { amount: Math.round(amount * 100) / 100 };
}

function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

async function recalculateTaskCharge({
    taskId,
    assigneeUserId = null,
    actualHours = null,
}) {
    let charge = 0;
    if (assigneeUserId >= 1) {
        const assignee = await getUserById({ id: assigneeUserId });
        charge = roundMoney((actualHours || 0) * (assignee?.hourly_rate || 0));
    }

    await updateTaskChargeById({ id: taskId, charge });
    return charge;
}

function normalizeOptionalUserId(value) {
    if (value == null || value === "") {
        return null;
    }
    const userId = Number(value);
    return userId >= 1 ? userId : null;
}

function normalizeOptionalProjectId(value) {
    if (value == null || value === "") {
        return null;
    }
    const projectId = Number(value);
    return projectId >= 1 ? projectId : null;
}

function normalizeDateField(value) {
    return toDbDateTime(value);
}

function dateKeyFromDateTime(value) {
    if (value == null || value === "") {
        return null;
    }
    const text = String(value).trim();
    return text.length >= 10 ? text.slice(0, 10) : null;
}

function validateDatesWithinSprintWeek({ start_at, end_at, sprint_week_start }) {
    const monday = normalizeSprintWeekStart(sprint_week_start);
    if (!monday) {
        return {};
    }
    const sunday = getSundayDate(monday);
    if (!sunday) {
        return { error: "Invalid sprint week" };
    }

    const startKey = dateKeyFromDateTime(start_at);
    if (startKey && (startKey < monday || startKey > sunday)) {
        return {
            error: `Start must fall within the sprint week (${monday} to ${sunday})`,
        };
    }

    const endKey = dateKeyFromDateTime(end_at);
    if (endKey && (endKey < monday || endKey > sunday)) {
        return {
            error: `End must fall within the sprint week (${monday} to ${sunday})`,
        };
    }

    if (start_at && end_at && String(start_at) > String(end_at)) {
        return { error: "Start must be before end" };
    }

    return {};
}

function completedOnForState(state, previousCompletedOn) {
    if (state === TASK_STATES.DONE) {
        return previousCompletedOn || getIstDateTime();
    }
    return null;
}

export async function logTaskActivity({ task_id, user_id, activity }) {
    return await createTaskActivity({ task_id, user_id, activity });
}

export async function addTask({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const title = String(body.title || "").trim();
    if (!title) {
        set.status = 400;
        return { error: "Title is required" };
    }

    const state = body.state || TASK_STATES.BACKLOG;
    const priority = body.priority || TASK_PRIORITIES.P3;

    if (!STATE_VALUES.has(state)) {
        set.status = 400;
        return { error: "Invalid state" };
    }
    if (!PRIORITY_VALUES.has(priority)) {
        set.status = 400;
        return { error: "Invalid priority" };
    }

    if (state !== TASK_STATES.BACKLOG) {
        set.status = 400;
        return { error: "New tasks must start in backlog" };
    }

    let projectId = normalizeOptionalProjectId(body.project_id);
    if (projectId != null && !isTaskAdminUser(currentUser)) {
        set.status = 403;
        return { error: "Only an admin can assign a project" };
    }
    if (projectId != null) {
        const customerProject = await getCustomerProjectById({ id: projectId });
        if (!customerProject) {
            set.status = 400;
            return { error: "Project not found" };
        }
    }

    const assigneeUserId = normalizeOptionalUserId(body.assignee_user_id);
    let assigneeUser = null;
    if (assigneeUserId != null) {
        assigneeUser = await getUserById({ id: assigneeUserId });
        if (!assigneeUser) {
            set.status = 400;
            return { error: "Assignee not found" };
        }
    }

    const reviewerUserId = normalizeOptionalUserId(body.reviewer_user_id);
    if (reviewerUserId != null) {
        const reviewerUser = await getUserById({ id: reviewerUserId });
        if (!reviewerUser) {
            set.status = 400;
            return { error: "Reviewer not found" };
        }
    }

    const completedOn = null;

    const expectedHoursResult = validateTaskHours(body.expected_hours, "Expected hours");
    if (expectedHoursResult.error) {
        set.status = 400;
        return { error: expectedHoursResult.error };
    }
    const actualHoursResult = validateTaskHours(body.actual_hours, "Burnt efforts");
    if (actualHoursResult.error) {
        set.status = 400;
        return { error: actualHoursResult.error };
    }

    // Backlog is a shared stack across sprints — no week until pulled into work.
    const sprintWeekStart = null;

    const taskId = await createTask({
        title,
        description: trimmedOrNull(body.description),
        expected_hours: expectedHoursResult.hours,
        actual_hours: actualHoursResult.hours,
        charge: null,
        start_at: normalizeDateField(body.start_at),
        end_at: normalizeDateField(body.end_at),
        completed_on: completedOn,
        state,
        priority,
        blocked_reason: null,
        project_id: projectId,
        assignee_user_id: assigneeUserId,
        reviewer_user_id: reviewerUserId,
        created_by_user_id: currentUser.id,
        sprint_week_start: sprintWeekStart,
    });

    if (!taskId) {
        set.status = 400;
        return { error: "Failed to create task" };
    }

    await recalculateTaskCharge({
        taskId,
        assigneeUserId,
        actualHours: actualHoursResult.hours,
    });

    await logTaskActivity({
        task_id: taskId,
        user_id: currentUser.id,
        activity: "Created task",
    });

    const task = await getTaskById({ id: taskId });
    if (assigneeUser && Number(assigneeUser.id) !== Number(currentUser.id)) {
        notifyTaskAssigned({
            task,
            assigneeUser,
            assignedByUser: currentUser,
        });
    }

    set.status = 201;
    return { message: "Task created", task };
}

export async function updateTask({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingTask = await getTaskById({ id: body.id });
    if (!existingTask) {
        set.status = 404;
        return { error: "Task not found" };
    }

    const title = String(body.title || "").trim();
    if (!title) {
        set.status = 400;
        return { error: "Title is required" };
    }

    let state = body.state;
    const priority = body.priority;

    if (!STATE_VALUES.has(state)) {
        set.status = 400;
        return { error: "Invalid state" };
    }
    if (!PRIORITY_VALUES.has(priority)) {
        set.status = 400;
        return { error: "Invalid priority" };
    }

    const existingProjectId =
        existingTask.project_id != null ? Number(existingTask.project_id) : null;
    let projectId = existingProjectId;
    if (body.project_id !== undefined) {
        const requestedProjectId = normalizeOptionalProjectId(body.project_id);
        if (requestedProjectId !== existingProjectId) {
            if (!isTaskAdminUser(currentUser)) {
                set.status = 403;
                return { error: "Only an admin can change the project" };
            }
            if (requestedProjectId != null) {
                const customerProject = await getCustomerProjectById({ id: requestedProjectId });
                if (!customerProject) {
                    set.status = 400;
                    return { error: "Project not found" };
                }
            }
            projectId = requestedProjectId;
        }
    }

    const assigneeUserId = normalizeOptionalUserId(body.assignee_user_id);
    let assigneeUser = null;
    if (assigneeUserId != null) {
        assigneeUser = await getUserById({ id: assigneeUserId });
        if (!assigneeUser) {
            set.status = 400;
            return { error: "Assignee not found" };
        }
    }

    const reviewerUserId = normalizeOptionalUserId(body.reviewer_user_id);
    let reviewerUser = null;
    if (reviewerUserId != null) {
        reviewerUser = await getUserById({ id: reviewerUserId });
        if (!reviewerUser) {
            set.status = 400;
            return { error: "Reviewer not found" };
        }
    }

    const previousState = existingTask.state || TASK_STATES.BACKLOG;
    const previousAssigneeUserId = existingTask.assignee_user_id
        ? Number(existingTask.assignee_user_id)
        : null;
    const previousReviewerUserId = existingTask.reviewer_user_id
        ? Number(existingTask.reviewer_user_id)
        : null;
    const stateChanging = state !== previousState;

    let transition = {
        assigneeUserId,
        reviewerUserId,
        requireComment: false,
        notifyReviewer: false,
    };

    if (stateChanging) {
        transition = resolveTaskStateTransition({
            task: { ...existingTask, assignee_user_id: assigneeUserId ?? existingTask.assignee_user_id },
            nextState: state,
            currentUser,
            assignee_user_id: assigneeUserId,
            reviewer_user_id: reviewerUserId,
            comment: body.comment,
        });
        if (transition.error) {
            set.status = transitionHttpStatus(transition.code);
            return { error: transition.error, code: transition.code };
        }
    } else {
        if (!canUserMoveTask({ task: existingTask, currentUser })) {
            set.status = 403;
            return {
                error: "Only the assignee, reviewer, or an admin can update this task",
                code: "move_forbidden",
            };
        }
        if (
            state === TASK_STATES.ANALYZING ||
            state === TASK_STATES.IN_PROGRESS ||
            state === TASK_STATES.UNDER_REVIEW
        ) {
            if (!(assigneeUserId >= 1)) {
                set.status = 400;
                return { error: "Assignee is required for this state", code: "assignee_required" };
            }
            if (state === TASK_STATES.UNDER_REVIEW && !(reviewerUserId >= 1)) {
                set.status = 400;
                return { error: "Reviewer is required for under review", code: "reviewer_required" };
            }
        }
    }

    const nextAssigneeUserId =
        transition.assigneeUserId !== undefined ? transition.assigneeUserId : assigneeUserId;
    const nextReviewerUserId =
        transition.reviewerUserId !== undefined ? transition.reviewerUserId : reviewerUserId;

    if (nextAssigneeUserId != null) {
        assigneeUser = await getUserById({ id: nextAssigneeUserId });
        if (!assigneeUser) {
            set.status = 400;
            return { error: "Assignee not found" };
        }
    }
    if (nextReviewerUserId != null) {
        reviewerUser = await getUserById({ id: nextReviewerUserId });
        if (!reviewerUser) {
            set.status = 400;
            return { error: "Reviewer not found" };
        }
    }

    const completedOn = completedOnForState(state, existingTask.completed_on);

    const expectedHoursResult = validateTaskHours(body.expected_hours, "Expected hours");
    if (expectedHoursResult.error) {
        set.status = 400;
        return { error: expectedHoursResult.error };
    }
    const actualHoursResult = validateTaskHours(body.actual_hours, "Actual hours");
    if (actualHoursResult.error) {
        set.status = 400;
        return { error: actualHoursResult.error };
    }

    let sprintWeekStart =
        body.sprint_week_start === undefined
            ? normalizeSprintWeekStart(existingTask.sprint_week_start)
            : body.sprint_week_start === null || body.sprint_week_start === ""
              ? null
              : normalizeSprintWeekStart(body.sprint_week_start);

    if (
        body.sprint_week_start !== undefined &&
        body.sprint_week_start !== null &&
        body.sprint_week_start !== "" &&
        sprintWeekStart == null
    ) {
        set.status = 400;
        return { error: "Invalid sprint week" };
    }

    if (
        previousState === TASK_STATES.BACKLOG &&
        (state === TASK_STATES.ANALYZING || state === TASK_STATES.IN_PROGRESS)
    ) {
        sprintWeekStart =
            normalizeSprintWeekStart(body.sprint_week_start) ||
            sprintWeekStart ||
            getMondayDate();
    }
    if (state === TASK_STATES.BACKLOG) {
        sprintWeekStart = null;
    }
    // No sprint week means the task belongs in backlog (done stays done).
    if (!sprintWeekStart && state !== TASK_STATES.DONE) {
        state = TASK_STATES.BACKLOG;
        sprintWeekStart = null;
    }

    const previousSprintWeek = normalizeSprintWeekStart(existingTask.sprint_week_start);
    const sprintChanging = previousSprintWeek !== sprintWeekStart;

    const startAt = normalizeDateField(body.start_at);
    const endAt = normalizeDateField(body.end_at);
    const sprintDateCheck = validateDatesWithinSprintWeek({
        start_at: startAt,
        end_at: endAt,
        sprint_week_start: sprintWeekStart,
    });
    if (sprintDateCheck.error) {
        set.status = 400;
        return { error: sprintDateCheck.error };
    }

    await updateTaskById({
        id: existingTask.id,
        title,
        description: trimmedOrNull(body.description),
        expected_hours: expectedHoursResult.hours,
        actual_hours: actualHoursResult.hours,
        charge: existingTask.charge,
        start_at: startAt,
        end_at: endAt,
        completed_on: completedOn,
        state,
        priority,
        blocked_reason: null,
        project_id: projectId,
        assignee_user_id: nextAssigneeUserId,
        reviewer_user_id: nextReviewerUserId,
        sprint_week_start: sprintWeekStart,
    });

    await recalculateTaskCharge({
        taskId: existingTask.id,
        assigneeUserId: nextAssigneeUserId,
        actualHours: actualHoursResult.hours,
    });

    if (transition.requireComment && transition.comment) {
        await createTaskComment({
            task_id: existingTask.id,
            user_id: currentUser.id,
            comment: transition.comment,
        });
        await logTaskActivity({
            task_id: existingTask.id,
            user_id: currentUser.id,
            activity: `Reviewer comment: "${String(transition.comment).slice(0, 120)}"`,
        });
    }

    const activities = [];
    if (stateChanging) {
        activities.push(
            `Changed state from ${stateLabel(previousState)} to ${stateLabel(state)}`,
        );
    }
    const previousPriority = existingTask.priority;
    if (priority !== previousPriority) {
        activities.push(
            `Changed priority from ${priorityLabel(previousPriority)} to ${priorityLabel(priority)}`,
        );
    }
    if (nextAssigneeUserId !== previousAssigneeUserId) {
        if (nextAssigneeUserId == null) {
            activities.push("Unassigned task");
        } else {
            activities.push(
                `Assigned to ${assigneeUser?.full_name || assigneeUser?.email || `#${nextAssigneeUserId}`}`,
            );
        }
    }
    if (nextReviewerUserId !== previousReviewerUserId) {
        if (nextReviewerUserId == null) {
            activities.push("Cleared reviewer");
        } else {
            activities.push(
                `Set reviewer to ${reviewerUser?.full_name || reviewerUser?.email || `#${nextReviewerUserId}`}`,
            );
        }
    }
    if (sprintChanging) {
        activities.push(
            sprintWeekStart
                ? `Moved to sprint week starting ${sprintWeekStart}`
                : "Removed from sprint week",
        );
    }

    for (const activity of activities) {
        await logTaskActivity({
            task_id: existingTask.id,
            user_id: currentUser.id,
            activity,
        });
    }

    const task = await getTaskById({ id: existingTask.id });

    if (
        nextAssigneeUserId !== previousAssigneeUserId &&
        assigneeUser &&
        Number(assigneeUser.id) !== Number(currentUser.id)
    ) {
        notifyTaskAssigned({
            task,
            assigneeUser,
            assignedByUser: currentUser,
        });
    }

    if (transition.notifyReviewer && reviewerUser) {
        notifyTaskReviewRequested({
            task,
            reviewerUser,
            requestedByUser: currentUser,
        });
    }

    set.status = 200;
    return { message: "Task updated", task };
}

export async function updateTaskState({ params, body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingTask = await getTaskById({ id: params.id });
    if (!existingTask) {
        set.status = 404;
        return { error: "Task not found" };
    }

    let state = body.state;
    if (!STATE_VALUES.has(state)) {
        set.status = 400;
        return { error: "Invalid state" };
    }

    const previousState = existingTask.state || TASK_STATES.BACKLOG;
    const transition = resolveTaskStateTransition({
        task: existingTask,
        nextState: state,
        currentUser,
        assignee_user_id: body.assignee_user_id,
        reviewer_user_id: body.reviewer_user_id,
        comment: body.comment,
    });

    if (transition.error) {
        set.status = transitionHttpStatus(transition.code);
        return { error: transition.error, code: transition.code };
    }

    if (transition.assigneeUserId != null) {
        const assigneeUser = await getUserById({ id: transition.assigneeUserId });
        if (!assigneeUser) {
            set.status = 400;
            return { error: "Assignee not found" };
        }
    }
    let reviewerUser = null;
    if (transition.reviewerUserId != null) {
        reviewerUser = await getUserById({ id: transition.reviewerUserId });
        if (!reviewerUser) {
            set.status = 400;
            return { error: "Reviewer not found" };
        }
    }

    const previousAssigneeUserId = existingTask.assignee_user_id
        ? Number(existingTask.assignee_user_id)
        : null;

    let sprintWeekStart = normalizeSprintWeekStart(existingTask.sprint_week_start);
    if (state === TASK_STATES.BACKLOG) {
        sprintWeekStart = null;
    } else if (
        previousState === TASK_STATES.BACKLOG &&
        (state === TASK_STATES.ANALYZING || state === TASK_STATES.IN_PROGRESS)
    ) {
        sprintWeekStart =
            normalizeSprintWeekStart(body.sprint_week_start) || getMondayDate();
        if (!sprintWeekStart) {
            set.status = 400;
            return { error: "Sprint week is required when leaving backlog" };
        }
    } else if (body.sprint_week_start !== undefined && body.sprint_week_start !== null) {
        const requestedWeek = normalizeSprintWeekStart(body.sprint_week_start);
        if (requestedWeek) {
            sprintWeekStart = requestedWeek;
        }
    }

    // No sprint week means the task belongs in backlog.
    if (!sprintWeekStart) {
        state = TASK_STATES.BACKLOG;
        sprintWeekStart = null;
    }

    const completedOn = completedOnForState(state, existingTask.completed_on);

    await updateTaskStateById({
        id: existingTask.id,
        state,
        completed_on: completedOn,
        blocked_reason: null,
        assignee_user_id: transition.assigneeUserId,
        reviewer_user_id: transition.reviewerUserId,
        sprint_week_start: sprintWeekStart,
    });

    if (transition.requireComment && transition.comment) {
        await createTaskComment({
            task_id: existingTask.id,
            user_id: currentUser.id,
            comment: transition.comment,
        });
        await logTaskActivity({
            task_id: existingTask.id,
            user_id: currentUser.id,
            activity: `Reviewer comment: "${String(transition.comment).slice(0, 120)}"`,
        });
    }

    if (state !== previousState) {
        await logTaskActivity({
            task_id: existingTask.id,
            user_id: currentUser.id,
            activity: `Changed state from ${stateLabel(previousState)} to ${stateLabel(state)}`,
        });
        if (
            previousState === TASK_STATES.BACKLOG &&
            sprintWeekStart &&
            (state === TASK_STATES.ANALYZING || state === TASK_STATES.IN_PROGRESS)
        ) {
            await logTaskActivity({
                task_id: existingTask.id,
                user_id: currentUser.id,
                activity: `Pulled into sprint week starting ${sprintWeekStart}`,
            });
        }
    }

    if (
        transition.assigneeUserId != null &&
        Number(transition.assigneeUserId) !== previousAssigneeUserId
    ) {
        const assigneeUser = await getUserById({ id: transition.assigneeUserId });
        if (assigneeUser && Number(assigneeUser.id) !== Number(currentUser.id)) {
            const taskForAssign = await getTaskById({ id: existingTask.id });
            notifyTaskAssigned({
                task: taskForAssign,
                assigneeUser,
                assignedByUser: currentUser,
            });
            await logTaskActivity({
                task_id: existingTask.id,
                user_id: currentUser.id,
                activity: `Assigned to ${assigneeUser.full_name || assigneeUser.email}`,
            });
        }
    }

    const task = await getTaskById({ id: existingTask.id });

    if (transition.notifyReviewer && reviewerUser) {
        notifyTaskReviewRequested({
            task,
            reviewerUser,
            requestedByUser: currentUser,
        });
        await logTaskActivity({
            task_id: existingTask.id,
            user_id: currentUser.id,
            activity: `Requested review from ${reviewerUser.full_name || reviewerUser.email}`,
        });
    }

    set.status = 200;
    return { message: "Task state updated", task };
}

export async function bulkUpdateTaskState({ body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const state = body.state;
    if (!STATE_VALUES.has(state)) {
        set.status = 400;
        return { error: "Invalid state" };
    }

    const ids = Array.isArray(body.ids) ? body.ids.map((id) => Number(id)).filter((id) => id >= 1) : [];
    if (!ids.length) {
        set.status = 400;
        return { error: "No task ids provided" };
    }

    let updatedCount = 0;
    const failures = [];
    for (const taskId of ids) {
        const existingTask = await getTaskById({ id: taskId });
        if (!existingTask) {
            continue;
        }

        const previousState = existingTask.state || TASK_STATES.BACKLOG;
        if (previousState === state) {
            continue;
        }

        const transition = resolveTaskStateTransition({
            task: existingTask,
            nextState: state,
            currentUser,
            assignee_user_id: body.assignee_user_id,
            reviewer_user_id: body.reviewer_user_id,
            comment: body.comment,
        });
        if (transition.error) {
            failures.push({ id: taskId, error: transition.error, code: transition.code });
            continue;
        }

        const completedOn = completedOnForState(state, existingTask.completed_on);
        await updateTaskStateById({
            id: taskId,
            state,
            completed_on: completedOn,
            blocked_reason: null,
            assignee_user_id: transition.assigneeUserId,
            reviewer_user_id: transition.reviewerUserId,
        });

        if (transition.requireComment && transition.comment) {
            await createTaskComment({
                task_id: taskId,
                user_id: currentUser.id,
                comment: transition.comment,
            });
        }

        await logTaskActivity({
            task_id: taskId,
            user_id: currentUser.id,
            activity: `Changed state from ${stateLabel(previousState)} to ${stateLabel(state)}`,
        });

        const task = await getTaskById({ id: taskId });
        if (transition.notifyReviewer && transition.reviewerUserId) {
            const reviewerUser = await getUserById({ id: transition.reviewerUserId });
            if (reviewerUser) {
                notifyTaskReviewRequested({
                    task,
                    reviewerUser,
                    requestedByUser: currentUser,
                });
            }
        }

        updatedCount += 1;
    }

    set.status = 200;
    return {
        message: "Tasks updated",
        updated_count: updatedCount,
        failures,
    };
}

export async function duplicateTask({ params, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const sourceTask = await getTaskById({ id: params.id });
    if (!sourceTask) {
        set.status = 404;
        return { error: "Task not found" };
    }

    const title = `${sourceTask.title} (copy)`.slice(0, 128);

    const taskId = await createTask({
        title,
        description: sourceTask.description,
        expected_hours: sourceTask.expected_hours,
        actual_hours: null,
        start_at: sourceTask.start_at,
        end_at: sourceTask.end_at,
        completed_on: null,
        state: TASK_STATES.BACKLOG,
        priority: sourceTask.priority || TASK_PRIORITIES.P3,
        blocked_reason: null,
        project_id: sourceTask.project_id,
        assignee_user_id: sourceTask.assignee_user_id,
        reviewer_user_id: null,
        created_by_user_id: currentUser.id,
        sprint_week_start: null,
    });

    if (!taskId) {
        set.status = 400;
        return { error: "Failed to duplicate task" };
    }

    await logTaskActivity({
        task_id: taskId,
        user_id: currentUser.id,
        activity: `Duplicated from task #${sourceTask.id}`,
    });

    const task = await getTaskById({ id: taskId });
    set.status = 201;
    return { message: "Task duplicated", task };
}

export async function deleteTask({ params, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }

    const existingTask = await getTaskById({ id: params.id });
    if (!existingTask) {
        set.status = 404;
        return { error: "Task not found" };
    }

    await deleteTaskById({ id: existingTask.id });
    set.status = 200;
    return { message: "Task deleted" };
}

export async function moveTaskToInvoice({ params, body, cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized" };
    }
    if (!isTaskAdminUser(currentUser)) {
        set.status = 403;
        return { error: "Only admins can add a task to an invoice" };
    }

    const existingTask = await getTaskById({ id: params.id });
    if (!existingTask) {
        set.status = 404;
        return { error: "Task not found" };
    }
    if (existingTask.customer_invoice_id) {
        set.status = 400;
        return { error: "This task is already added to an invoice" };
    }
    if (existingTask.state !== TASK_STATES.DONE) {
        set.status = 400;
        return { error: "Only completed tasks can be added to an invoice" };
    }
    if (!(existingTask.project_id >= 1)) {
        set.status = 400;
        return { error: "Assign a project to this task before adding it to an invoice" };
    }
    const burntHours = Number(existingTask.actual_hours);
    if (!Number.isFinite(burntHours) || burntHours <= 0) {
        set.status = 400;
        return { error: "Burnt efforts must be greater than 0 before adding to an invoice" };
    }

    const invoiceId = Number(body.customer_invoice_id || 0);
    if (!(invoiceId >= 1)) {
        set.status = 400;
        return { error: "Invoice is required" };
    }

    const invoice = await getCustomerInvoiceById({ id: invoiceId });
    if (!invoice) {
        set.status = 404;
        return { error: "Invoice not found" };
    }
    if (Number(invoice.project_id) !== Number(existingTask.project_id)) {
        set.status = 400;
        return { error: "Invoice must belong to the task project" };
    }

    const item = String(body.item || "").trim();
    if (!item) {
        set.status = 400;
        return { error: "Item is required" };
    }
    if (item.length > 128) {
        set.status = 400;
        return { error: "Item must be 128 characters or fewer" };
    }

    const costResult = normalizeMoney(body.cost, "Price");
    if (costResult.error || costResult.amount == null) {
        set.status = 400;
        return { error: costResult.error || "Price is required" };
    }

    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        set.status = 400;
        return { error: "Quantity must be greater than 0" };
    }

    const itemId = await createInvoiceItem({
        customer_invoice_id: invoice.id,
        item,
        cost: costResult.amount,
        quantity,
    });
    if (!itemId) {
        set.status = 400;
        return { error: "Failed to add invoice item" };
    }

    await updateCustomerInvoiceTotal({ id: invoice.id });
    await updateTaskInvoiceLinkById({
        id: existingTask.id,
        customer_invoice_id: invoice.id,
        invoice_item_id: itemId,
    });

    await logTaskActivity({
        task_id: existingTask.id,
        user_id: currentUser.id,
        activity: `Added to invoice #${invoice.id}${
            invoice.hbt_sequence ? ` (HBT-${invoice.hbt_sequence})` : ""
        }`,
    });

    const task = await getTaskById({ id: existingTask.id });
    const updatedInvoice = await getCustomerInvoiceById({ id: invoice.id });

    set.status = 200;
    return {
        message: "Task added to invoice",
        task,
        invoice: updatedInvoice,
        invoice_item_id: itemId,
    };
}
