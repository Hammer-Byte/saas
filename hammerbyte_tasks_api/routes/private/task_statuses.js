import { t } from "elysia";
import {
	addTaskStatus,
	deleteTaskStatus,
	getTaskStatus,
	getTaskStatuses,
	updateTaskStatus,
} from "../../services/task_statuses.js";
import { ERRORS } from "../../constants.js";

const taskStatusIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function taskStatuses(app) {
	return app
		.get("/", getTaskStatuses, {
			detail: {
				tags: ["Task Statuses"],
				summary: "List task statuses",
				description: "Returns all task statuses.",
			},
		})
		.get("/:id", getTaskStatus, {
			params: taskStatusIdParams,
			detail: {
				tags: ["Task Statuses"],
				summary: "Get task status",
				description: "Returns a single task status by id.",
			},
		})
		.post("/", addTaskStatus, {
			body: t.Object({
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
			}),
			detail: {
				tags: ["Task Statuses"],
				summary: "Create task status",
				description: "Creates a new task status.",
			},
		})
		.patch("/:id", updateTaskStatus, {
			params: taskStatusIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
			}),
			detail: {
				tags: ["Task Statuses"],
				summary: "Update task status",
				description: "Updates an existing task status.",
			},
		})
		.delete("/:id", deleteTaskStatus, {
			params: taskStatusIdParams,
			detail: {
				tags: ["Task Statuses"],
				summary: "Delete task status",
				description: "Deletes a task status by id.",
			},
		});
}
