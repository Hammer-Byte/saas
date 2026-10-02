import { t } from "elysia";
import {
	addTaskPriority,
	deleteTaskPriority,
	getTaskPriorities,
	getTaskPriority,
	updateTaskPriority,
} from "../../services/task_priorities.js";
import { ERRORS } from "../../constants.js";

const taskPriorityIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function taskPriorities(app) {
	return app
		.get("/", getTaskPriorities, {
			detail: {
				tags: ["Task Priorities"],
				summary: "List task priorities",
				description: "Returns all task priorities.",
			},
		})
		.get("/:id", getTaskPriority, {
			params: taskPriorityIdParams,
			detail: {
				tags: ["Task Priorities"],
				summary: "Get task priority",
				description: "Returns a single task priority by id.",
			},
		})
		.post("/", addTaskPriority, {
			body: t.Object({
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
			}),
			detail: {
				tags: ["Task Priorities"],
				summary: "Create task priority",
				description: "Creates a new task priority.",
			},
		})
		.patch("/:id", updateTaskPriority, {
			params: taskPriorityIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
			}),
			detail: {
				tags: ["Task Priorities"],
				summary: "Update task priority",
				description: "Updates an existing task priority.",
			},
		})
		.delete("/:id", deleteTaskPriority, {
			params: taskPriorityIdParams,
			detail: {
				tags: ["Task Priorities"],
				summary: "Delete task priority",
				description: "Deletes a task priority by id.",
			},
		});
}
