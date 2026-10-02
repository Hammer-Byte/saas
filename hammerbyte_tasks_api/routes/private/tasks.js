import { t } from "elysia";
import {
	addTask,
	deleteTask,
	getTask,
	getTasks,
	updateTask,
} from "../../services/tasks.js";
import { addTaskComment, getTaskComments } from "../../services/task_comments.js";
import { ERRORS } from "../../constants.js";

const taskIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function tasks(app) {
	return app
		.get("/", getTasks, {
			query: t.Object({
				start: t.String({ minLength: 1, error: ERRORS.VALIDATION.START_REQUIRED }),
				end: t.String({ minLength: 1, error: ERRORS.VALIDATION.END_REQUIRED }),
			}),
			detail: {
				tags: ["Tasks"],
				summary: "Get all tasks",
				description: "Returns all tasks in the given created_at date range.",
			},
		})
		.get("/:id", getTask, {
			params: taskIdParams,
			detail: {
				tags: ["Tasks"],
				summary: "Get single task",
				description: "Returns a single task by id, including attachments.",
			},
		})
		.get("/:id/comments", getTaskComments, {
			params: taskIdParams,
			detail: {
				tags: ["Task Comments"],
				summary: "List task comments",
				description: "Returns all comments for the given task, including attachments.",
			},
		})
		.post("/:id/comments", addTaskComment, {
			params: taskIdParams,
			body: t.Object({
				comment: t.String({ minLength: 1, error: ERRORS.VALIDATION.COMMENT_REQUIRED }),
				attachments: t.Optional(
					t.Array(
						t.Number({ minimum: 1, error: ERRORS.VALIDATION.MEDIA_ID_REQUIRED }),
						{ error: ERRORS.VALIDATION.ATTACHMENTS_INVALID },
					),
				),
			}),
			detail: {
				tags: ["Task Comments"],
				summary: "Create task comment",
				description:
					"Creates a comment on a task. comment is required. attachments is an optional list of media ids.",
			},
		})
		.post("/", addTask, {
			body: t.Object({
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				description: t.String({
					minLength: 1,
					error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED,
				}),
				status_id: t.Number({
					minimum: 1,
					error: ERRORS.VALIDATION.STATUS_ID_REQUIRED,
				}),
				priority_id: t.Number({
					minimum: 1,
					error: ERRORS.VALIDATION.PRIORITY_ID_REQUIRED,
				}),
				handler_id: t.Optional(
					t.Number({ minimum: 1, error: ERRORS.VALIDATION.HANDLER_ID_REQUIRED }),
				),
				due_at: t.String({ minLength: 1, error: ERRORS.VALIDATION.DUE_AT_REQUIRED }),
				attachments: t.Optional(
					t.Array(
						t.Number({ minimum: 1, error: ERRORS.VALIDATION.MEDIA_ID_REQUIRED }),
						{ error: ERRORS.VALIDATION.ATTACHMENTS_INVALID },
					),
				),
			}),
			detail: {
				tags: ["Tasks"],
				summary: "Create task",
				description:
					"Creates a new task. title, description, and due_at are required. attachments is an optional list of media ids.",
			},
		})
		.patch("/:id", updateTask, {
			params: taskIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
				description: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED }),
				),
				status_id: t.Optional(
					t.Number({ minimum: 1, error: ERRORS.VALIDATION.STATUS_ID_REQUIRED }),
				),
				priority_id: t.Optional(
					t.Number({ minimum: 1, error: ERRORS.VALIDATION.PRIORITY_ID_REQUIRED }),
				),
				handler_id: t.Optional(
					t.Number({ minimum: 1, error: ERRORS.VALIDATION.HANDLER_ID_REQUIRED }),
				),
				due_at: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.DUE_AT_REQUIRED }),
				),
				attachments: t.Optional(
					t.Array(
						t.Number({ minimum: 1, error: ERRORS.VALIDATION.MEDIA_ID_REQUIRED }),
						{ error: ERRORS.VALIDATION.ATTACHMENTS_INVALID },
					),
				),
			}),
			detail: {
				tags: ["Tasks"],
				summary: "Update task",
				description:
					"Updates an existing task. When title, description, or due_at are sent they must be non-empty. When attachments is provided, it replaces the set.",
			},
		})
		.delete("/:id", deleteTask, {
			params: taskIdParams,
			detail: {
				tags: ["Tasks"],
				summary: "Delete task",
				description: "Deletes a task and its attachments by id.",
			},
		});
}

