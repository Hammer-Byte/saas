import {
	createTaskStatus,
	deleteTaskStatusById,
	getAllTaskStatuses,
	getTaskStatusById,
	updateTaskStatusById,
} from "../entities/task_statuses.js";
import { ERRORS } from "../constants.js";

export async function getTaskStatuses({ set }) {
	const taskStatuses = await getAllTaskStatuses();
	set.status = 200;
	return taskStatuses;
}

export async function getTaskStatus({ params, set }) {
	const taskStatus = await getTaskStatusById(params);
	if (!taskStatus) {
		set.status = 404;
		return { error: ERRORS.TASK_STATUS_NOT_FOUND };
	}
	set.status = 200;
	return taskStatus;
}

export async function addTaskStatus({ body, user, set }) {
	const taskStatus = await createTaskStatus({
		title: body.title.trim(),
		created_by: user.id,
		updated_by: user.id,
	});
	set.status = 201;
	return taskStatus;
}

export async function updateTaskStatus({ params, body, user, set }) {
	const existingTaskStatus = await getTaskStatusById(params);
	if (!existingTaskStatus) {
		set.status = 404;
		return { error: ERRORS.TASK_STATUS_NOT_FOUND };
	}

	const taskStatusUpdate = { updated_by: user.id };
	if (body.title) {
		taskStatusUpdate.title = body.title.trim();
	}

	const taskStatus = await updateTaskStatusById({ id: params.id, ...taskStatusUpdate });
	set.status = 200;
	return taskStatus;
}

export async function deleteTaskStatus({ params, set }) {
	const existingTaskStatus = await getTaskStatusById(params);
	if (!existingTaskStatus) {
		set.status = 404;
		return { error: ERRORS.TASK_STATUS_NOT_FOUND };
	}

	deleteTaskStatusById(params);
	set.status = 204;
	return;
}
