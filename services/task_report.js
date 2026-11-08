import { TASK_STATE_LABELS, TASK_STATES } from "../constants.js";
import { getAllTasks } from "../db/tasks.js";
import { getIstDateTime } from "../libs/date.js";

const TERMINAL_STATES = new Set([TASK_STATES.DONE, TASK_STATES.CANCELLED]);

function dateKeyFromDateTime(value) {
    if (value == null || value === "") {
        return null;
    }
    const text = String(value).trim();
    if (text.length >= 10) {
        return text.slice(0, 10);
    }
    return null;
}

function taskInRange(task, from, to) {
    const createdKey = dateKeyFromDateTime(task.created_on);
    const endKey = dateKeyFromDateTime(task.end_at);

    if (createdKey && createdKey >= from && createdKey <= to) {
        return true;
    }
    if (endKey && endKey >= from && endKey <= to) {
        return true;
    }
    return false;
}

function emptyEmployeeBucket(key, label) {
    return {
        key,
        label,
        task_count: 0,
        done_count: 0,
        blocked_count: 0,
        overdue_count: 0,
    };
}

function emptyProjectBucket(key, label) {
    return {
        key,
        label,
        task_count: 0,
        done_count: 0,
        blocked_count: 0,
        overdue_count: 0,
    };
}

export async function buildTaskReport({ from, to }) {
    const allTasks = await getAllTasks();
    const tasks = allTasks.filter((task) => taskInRange(task, from, to));

    const todayKey = getIstDateTime().slice(0, 10);

    const stateTotals = {};
    for (const state of Object.values(TASK_STATES)) {
        stateTotals[state] = 0;
    }

    const employeeBuckets = new Map();
    const projectBuckets = new Map();

    let overdueCount = 0;
    let unassignedCount = 0;
    let doneCount = 0;

    for (const task of tasks) {
        const state = task.state || TASK_STATES.TODO;
        if (stateTotals[state] == null) {
            stateTotals[state] = 0;
        }
        stateTotals[state] += 1;

        if (state === TASK_STATES.DONE) {
            doneCount += 1;
        }

        const endKey = dateKeyFromDateTime(task.end_at);
        const isOverdue =
            endKey &&
            endKey < todayKey &&
            !TERMINAL_STATES.has(state);
        if (isOverdue) {
            overdueCount += 1;
        }

        const assigneeKey = task.assignee_user_id
            ? String(task.assignee_user_id)
            : "unassigned";
        const assigneeLabel = task.assignee_user_id
            ? task.assignee_full_name ||
              task.assignee_email ||
              `User #${task.assignee_user_id}`
            : "Unassigned";

        if (!employeeBuckets.has(assigneeKey)) {
            employeeBuckets.set(assigneeKey, emptyEmployeeBucket(assigneeKey, assigneeLabel));
        }
        const employeeBucket = employeeBuckets.get(assigneeKey);
        employeeBucket.task_count += 1;
        if (state === TASK_STATES.DONE) {
            employeeBucket.done_count += 1;
        }
        if (state === TASK_STATES.BLOCKED) {
            employeeBucket.blocked_count += 1;
        }
        if (isOverdue) {
            employeeBucket.overdue_count += 1;
        }

        if (!task.assignee_user_id) {
            unassignedCount += 1;
        }

        const projectKey = task.project_id ? String(task.project_id) : "no_project";
        const projectLabel = task.project_id
            ? task.project_title ||
              (task.customer_full_name
                  ? `${task.customer_full_name} — #${task.project_id}`
                  : `Project #${task.project_id}`)
            : "No project";

        if (!projectBuckets.has(projectKey)) {
            projectBuckets.set(projectKey, emptyProjectBucket(projectKey, projectLabel));
        }
        const projectBucket = projectBuckets.get(projectKey);
        projectBucket.task_count += 1;
        if (state === TASK_STATES.DONE) {
            projectBucket.done_count += 1;
        }
        if (state === TASK_STATES.BLOCKED) {
            projectBucket.blocked_count += 1;
        }
        if (isOverdue) {
            projectBucket.overdue_count += 1;
        }
    }

    const byEmployee = Array.from(employeeBuckets.values()).sort((left, right) => {
        if (left.key === "unassigned") return 1;
        if (right.key === "unassigned") return -1;
        return right.task_count - left.task_count;
    });

    const byProject = Array.from(projectBuckets.values()).sort(
        (left, right) => right.task_count - left.task_count,
    );

    const chartEmployees = byEmployee.filter((row) => row.key !== "unassigned");
    const stateTotalsList = Object.entries(stateTotals).map(([state, count]) => ({
        state,
        label: TASK_STATE_LABELS[state] || state,
        count: Number(count || 0),
    }));

    return {
        range: { from, to },
        totals: {
            tasks: tasks.length,
            done: doneCount,
            overdue: overdueCount,
            unassigned: unassignedCount,
        },
        byEmployee,
        byProject,
        stateTotals: stateTotalsList,
        charts: {
            tasksByEmployee: {
                labels: chartEmployees.map((row) => row.label),
                values: chartEmployees.map((row) => row.task_count),
            },
            tasksByProject: {
                labels: byProject
                    .filter((row) => row.key !== "no_project")
                    .slice(0, 15)
                    .map((row) => row.label),
                values: byProject
                    .filter((row) => row.key !== "no_project")
                    .slice(0, 15)
                    .map((row) => row.task_count),
            },
            tasksByState: {
                labels: stateTotalsList.map((row) => row.label),
                values: stateTotalsList.map((row) => row.count),
            },
            overdueByEmployee: {
                labels: chartEmployees.map((row) => row.label),
                values: chartEmployees.map((row) => row.overdue_count),
            },
        },
    };
}
