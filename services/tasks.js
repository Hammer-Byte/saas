import {
    TASK_PRIORITIES,
    TASK_PRIORITY_LABELS,
    TASK_STATE_LABELS,
    TASK_STATES,
} from "../constants.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import {
    createTask,
    deleteTaskById,
    getTaskById,
    updateTaskById,
    updateTaskStateById,
} from "../db/tasks.js";
import { createTaskActivity } from "../db/task_activities.js";
import {
    createTaskFollower,
    deleteTaskFollowerByTaskIdAndUserId,
    getAllTaskFollowersByTaskId,
    getTaskFollowerByTaskIdAndUserId,
} from "../db/task_followers.js";
import { getUserById } from "../db/users.js";
import { getIstDateTime, toDbDateTime } from "../libs/date.js";
import { notifyTaskAssigned, notifyTaskFollowers } from "../libs/task_notify.js";
import { getCurrentUser } from "./authentication.js";

const STATE_VALUES = new Set(Object.values(TASK_STATES));
const PRIORITY_VALUES = new Set(Object.values(TASK_PRIORITIES));

function stateLabel(state) {
    return TASK_STATE_LABELS[state] || state || "—";
}

function priorityLabel(priority) {
    return TASK_PRIORITY_LABELS[priority] || priority || "—";
}

function assigneeLabel(task) {
    if (!task?.assignee_user_id) {
        return "Unassigned";
    }
    return task.assignee_full_name || task.assignee_email || `User #${task.assignee_user_id}`;
}

function trimmedOrNull(value) {
    if (value == null || value === "") {
        return null;
    }
    const text = String(value).trim();
    return text || null;
}

function normalizeHours(value) {
    if (value == null || value === "") {
        return null;
    }
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
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

function completedOnForState(state, previousCompletedOn) {
    if (state === TASK_STATES.DONE) {
        return previousCompletedOn || getIstDateTime();
    }
    return null;
}

export async function logTaskActivity({ task_id, user_id, activity }) {
    return await createTaskActivity({ task_id, user_id, activity });
}

async function notifyFollowersOfUpdate({ task, subject, message, actorUser }) {
    const followers = await getAllTaskFollowersByTaskId({ task_id: task.id });
    if (!followers.length) {
        return;
    }
    notifyTaskFollowers({ task, followers, subject, message, actorUser });
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

    const state = body.state || TASK_STATES.TODO;
    const priority = body.priority || TASK_PRIORITIES.MEDIUM;

    if (!STATE_VALUES.has(state)) {
        set.status = 400;
        return { error: "Invalid state" };
    }
    if (!PRIORITY_VALUES.has(priority)) {
        set.status = 400;
        return { error: "Invalid priority" };
    }

    const projectId = normalizeOptionalProjectId(body.project_id);
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

    const completedOn =
        state === TASK_STATES.DONE ? getIstDateTime() : null;

    const taskId = await createTask({
        title,
        description: trimmedOrNull(body.description),
        expected_hours: normalizeHours(body.expected_hours),
        actual_hours: normalizeHours(body.actual_hours),
        start_at: normalizeDateField(body.start_at),
        end_at: normalizeDateField(body.end_at),
        completed_on: completedOn,
        state,
        priority,
        blocked_reason: trimmedOrNull(body.blocked_reason),
        project_id: projectId,
        assignee_user_id: assigneeUserId,
        created_by_user_id: currentUser.id,
    });

    if (!taskId) {
        set.status = 400;
        return { error: "Failed to create task" };
    }

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

    const state = body.state;
    const priority = body.priority;

    if (!STATE_VALUES.has(state)) {
        set.status = 400;
        return { error: "Invalid state" };
    }
    if (!PRIORITY_VALUES.has(priority)) {
        set.status = 400;
        return { error: "Invalid priority" };
    }

    const projectId = normalizeOptionalProjectId(body.project_id);
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

    const previousState = existingTask.state;
    const previousAssigneeUserId = existingTask.assignee_user_id
        ? Number(existingTask.assignee_user_id)
        : null;
    const assigneeChanging = assigneeUserId !== previousAssigneeUserId;
    const stateChanging = state !== previousState;

    const completedOn = completedOnForState(state, existingTask.completed_on);

    await updateTaskById({
        id: existingTask.id,
        title,
        description: trimmedOrNull(body.description),
        expected_hours: normalizeHours(body.expected_hours),
        actual_hours: normalizeHours(body.actual_hours),
        start_at: normalizeDateField(body.start_at),
        end_at: normalizeDateField(body.end_at),
        completed_on: completedOn,
        state,
        priority,
        blocked_reason: trimmedOrNull(body.blocked_reason),
        project_id: projectId,
        assignee_user_id: assigneeUserId,
    });

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
    if (assigneeChanging) {
        const updatedTaskPreview = { ...existingTask, assignee_user_id: assigneeUserId };
        if (assigneeUserId == null) {
            activities.push("Unassigned task");
        } else {
            activities.push(`Assigned to ${assigneeLabel(updatedTaskPreview)}`);
        }
    }

    for (const activity of activities) {
        await logTaskActivity({
            task_id: existingTask.id,
            user_id: currentUser.id,
            activity,
        });
    }

    const task = await getTaskById({ id: existingTask.id });

    if (assigneeChanging && assigneeUser && Number(assigneeUser.id) !== Number(currentUser.id)) {
        notifyTaskAssigned({
            task,
            assigneeUser,
            assignedByUser: currentUser,
        });
    }

    if (stateChanging || assigneeChanging) {
        const messageParts = [];
        if (stateChanging) {
            messageParts.push(
                `State changed to ${stateLabel(state)}`,
            );
        }
        if (assigneeChanging) {
            messageParts.push(`Assignee: ${assigneeLabel(task)}`);
        }
        await notifyFollowersOfUpdate({
            task,
            subject: `Task updated — ${task.title}`,
            message: messageParts.join(". "),
            actorUser: currentUser,
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

    const state = body.state;
    if (!STATE_VALUES.has(state)) {
        set.status = 400;
        return { error: "Invalid state" };
    }

    const previousState = existingTask.state;
    const completedOn = completedOnForState(state, existingTask.completed_on);
    const blockedReason =
        state === TASK_STATES.BLOCKED
            ? trimmedOrNull(body.blocked_reason)
            : null;

    await updateTaskStateById({
        id: existingTask.id,
        state,
        completed_on: completedOn,
        blocked_reason: blockedReason,
    });

    if (state !== previousState) {
        await logTaskActivity({
            task_id: existingTask.id,
            user_id: currentUser.id,
            activity: `Changed state from ${stateLabel(previousState)} to ${stateLabel(state)}`,
        });

        const task = await getTaskById({ id: existingTask.id });
        await notifyFollowersOfUpdate({
            task,
            subject: `Task state — ${task.title}`,
            message: `State changed to ${stateLabel(state)}`,
            actorUser: currentUser,
        });

        set.status = 200;
        return { message: "Task state updated", task };
    }

    const task = await getTaskById({ id: existingTask.id });
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
    for (const taskId of ids) {
        const existingTask = await getTaskById({ id: taskId });
        if (!existingTask) {
            continue;
        }

        const previousState = existingTask.state;
        if (previousState === state) {
            continue;
        }

        const completedOn = completedOnForState(state, existingTask.completed_on);
        await updateTaskStateById({
            id: taskId,
            state,
            completed_on: completedOn,
            blocked_reason:
                state === TASK_STATES.BLOCKED ? existingTask.blocked_reason : null,
        });

        await logTaskActivity({
            task_id: taskId,
            user_id: currentUser.id,
            activity: `Changed state from ${stateLabel(previousState)} to ${stateLabel(state)}`,
        });

        const task = await getTaskById({ id: taskId });
        await notifyFollowersOfUpdate({
            task,
            subject: `Task state — ${task.title}`,
            message: `State changed to ${stateLabel(state)}`,
            actorUser: currentUser,
        });

        updatedCount += 1;
    }

    set.status = 200;
    return { message: "Tasks updated", updated_count: updatedCount };
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
        state: TASK_STATES.TODO,
        priority: sourceTask.priority || TASK_PRIORITIES.MEDIUM,
        blocked_reason: null,
        project_id: sourceTask.project_id,
        assignee_user_id: sourceTask.assignee_user_id,
        created_by_user_id: currentUser.id,
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

export async function followTask({ params, cookie, set }) {
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

    const existingFollower = await getTaskFollowerByTaskIdAndUserId({
        task_id: existingTask.id,
        user_id: currentUser.id,
    });
    if (existingFollower) {
        set.status = 200;
        return { message: "Already following task" };
    }

    await createTaskFollower({
        task_id: existingTask.id,
        user_id: currentUser.id,
    });

    await logTaskActivity({
        task_id: existingTask.id,
        user_id: currentUser.id,
        activity: "Started following task",
    });

    set.status = 201;
    return { message: "Following task" };
}

export async function unfollowTask({ params, cookie, set }) {
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

    await deleteTaskFollowerByTaskIdAndUserId({
        task_id: existingTask.id,
        user_id: currentUser.id,
    });

    await logTaskActivity({
        task_id: existingTask.id,
        user_id: currentUser.id,
        activity: "Stopped following task",
    });

    set.status = 200;
    return { message: "Unfollowed task" };
}
