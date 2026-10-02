import {
	createTaskPriority,
	deleteTaskPriorityById,
	getAllTaskPriorities,
	getTaskPriorityById,
	updateTaskPriorityById,
} from "../entities/task_priorities.js";
import { ERRORS } from "../constants.js";

export async function getTaskPriorities({ set }) {
	const taskPriorities = await getAllTaskPriorities();
	set.status = 200;
	return taskPriorities;
}

export async function getTaskPriority({ params, set }) {
	const taskPriority = await getTaskPriorityById(params);
	if (!taskPriority) {
		set.status = 404;
		return { error: ERRORS.TASK_PRIORITY_NOT_FOUND };
	}
	set.status = 200;
	return taskPriority;
}

export async function addTaskPriority({ body, user, set }) {
	const taskPriority = await createTaskPriority({
		title: body.title.trim(),
		created_by: user.id,
		updated_by: user.id,
	});
	set.status = 201;
	return taskPriority;
}

export async function updateTaskPriority({ params, body, user, set }) {
	const existingTaskPriority = await getTaskPriorityById(params);
	if (!existingTaskPriority) {
		set.status = 404;
		return { error: ERRORS.TASK_PRIORITY_NOT_FOUND };
	}

	const taskPriorityUpdate = { updated_by: user.id };
	if (body.title) {
		taskPriorityUpdate.title = body.title.trim();
	}

	const taskPriority = await updateTaskPriorityById({ id: params.id, ...taskPriorityUpdate });
	set.status = 200;
	return taskPriority;
}

export async function deleteTaskPriority({ params, set }) {
	const existingTaskPriority = await getTaskPriorityById(params);
	if (!existingTaskPriority) {
		set.status = 404;
		return { error: ERRORS.TASK_PRIORITY_NOT_FOUND };
	}

	deleteTaskPriorityById(params);
	set.status = 204;
	return;
}
