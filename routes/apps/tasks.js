import { t } from "elysia";
import { TASK_PRIORITIES, TASK_STATES } from "../../constants.js";
import {
    addTask,
    bulkUpdateTaskState,
    deleteTask,
    duplicateTask,
    followTask,
    unfollowTask,
    updateTask,
    updateTaskState,
} from "../../services/tasks.js";

export default function (app) {
    return app
        .post("/", addTask, {
            body: t.Object({
                title: t.String({ minLength: 1, maxLength: 128 }),
                description: t.Optional(t.String()),
                expected_hours: t.Optional(t.Union([t.Numeric(), t.Null()])),
                actual_hours: t.Optional(t.Union([t.Numeric(), t.Null()])),
                start_at: t.Optional(t.Union([t.String(), t.Null()])),
                end_at: t.Optional(t.Union([t.String(), t.Null()])),
                state: t.Optional(
                    t.Union([
                        t.Literal(TASK_STATES.TODO),
                        t.Literal(TASK_STATES.IN_PROGRESS),
                        t.Literal(TASK_STATES.BLOCKED),
                        t.Literal(TASK_STATES.DONE),
                        t.Literal(TASK_STATES.CANCELLED),
                    ]),
                ),
                priority: t.Optional(
                    t.Union([
                        t.Literal(TASK_PRIORITIES.LOW),
                        t.Literal(TASK_PRIORITIES.MEDIUM),
                        t.Literal(TASK_PRIORITIES.HIGH),
                    ]),
                ),
                blocked_reason: t.Optional(t.Union([t.String({ maxLength: 512 }), t.Null()])),
                project_id: t.Optional(t.Union([t.Numeric({ minimum: 1 }), t.Null()])),
                assignee_user_id: t.Optional(t.Union([t.Numeric({ minimum: 1 }), t.Null()])),
            }),
            detail: {
                tags: ["Tasks"],
                summary: "Create a task",
            },
        })
        .patch("/", updateTask, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                title: t.String({ minLength: 1, maxLength: 128 }),
                description: t.Optional(t.Union([t.String(), t.Null()])),
                expected_hours: t.Optional(t.Union([t.Numeric(), t.Null()])),
                actual_hours: t.Optional(t.Union([t.Numeric(), t.Null()])),
                start_at: t.Optional(t.Union([t.String(), t.Null()])),
                end_at: t.Optional(t.Union([t.String(), t.Null()])),
                state: t.Union([
                    t.Literal(TASK_STATES.TODO),
                    t.Literal(TASK_STATES.IN_PROGRESS),
                    t.Literal(TASK_STATES.BLOCKED),
                    t.Literal(TASK_STATES.DONE),
                    t.Literal(TASK_STATES.CANCELLED),
                ]),
                priority: t.Union([
                    t.Literal(TASK_PRIORITIES.LOW),
                    t.Literal(TASK_PRIORITIES.MEDIUM),
                    t.Literal(TASK_PRIORITIES.HIGH),
                ]),
                blocked_reason: t.Optional(t.Union([t.String({ maxLength: 512 }), t.Null()])),
                project_id: t.Optional(t.Union([t.Numeric({ minimum: 1 }), t.Null()])),
                assignee_user_id: t.Optional(t.Union([t.Numeric({ minimum: 1 }), t.Null()])),
            }),
            detail: {
                tags: ["Tasks"],
                summary: "Update a task",
            },
        })
        .patch("/:id/state", updateTaskState, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            body: t.Object({
                state: t.Union([
                    t.Literal(TASK_STATES.TODO),
                    t.Literal(TASK_STATES.IN_PROGRESS),
                    t.Literal(TASK_STATES.BLOCKED),
                    t.Literal(TASK_STATES.DONE),
                    t.Literal(TASK_STATES.CANCELLED),
                ]),
                blocked_reason: t.Optional(t.Union([t.String({ maxLength: 512 }), t.Null()])),
            }),
            detail: {
                tags: ["Tasks"],
                summary: "Update task state",
            },
        })
        .post("/bulk-state", bulkUpdateTaskState, {
            body: t.Object({
                ids: t.Array(t.Numeric({ minimum: 1 }), { minItems: 1 }),
                state: t.Union([
                    t.Literal(TASK_STATES.TODO),
                    t.Literal(TASK_STATES.IN_PROGRESS),
                    t.Literal(TASK_STATES.BLOCKED),
                    t.Literal(TASK_STATES.DONE),
                    t.Literal(TASK_STATES.CANCELLED),
                ]),
            }),
            detail: {
                tags: ["Tasks"],
                summary: "Bulk update task state",
            },
        })
        .post("/:id/duplicate", duplicateTask, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Tasks"],
                summary: "Duplicate a task",
            },
        })
        .delete("/:id", deleteTask, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Tasks"],
                summary: "Delete a task",
            },
        })
        .post("/:id/follow", followTask, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Tasks"],
                summary: "Follow a task",
            },
        })
        .delete("/:id/follow", unfollowTask, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Tasks"],
                summary: "Unfollow a task",
            },
        });
}
