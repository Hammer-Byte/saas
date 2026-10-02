import {
	createTask,
	deleteTaskById,
	getAllTasksByCreatedAtRange,
	getTaskById,
	updateTaskById,
} from "../entities/tasks.js";
import {
	createTaskAttachment,
	deleteTaskAttachmentsByTaskId,
} from "../entities/task_attachments.js";
import { getTaskStatusById } from "../entities/task_statuses.js";
import { getTaskPriorityById } from "../entities/task_priorities.js";
import { ERRORS } from "../constants.js";

export async function getTasks({ query, set }) {
	const tasks = await getAllTasksByCreatedAtRange(query);
	set.status = 200;
	return tasks;
}

export async function getTask({ params, set }) {
	const task = await getTaskById(params);
	if (!task) {
		set.status = 404;
		return { error: ERRORS.TASK_NOT_FOUND };
	}
	set.status = 200;
	return task;
}

export async function addTask({ body, user, set }) {
	const taskStatus = await getTaskStatusById({ id: body.status_id });
	if (!taskStatus) {
		set.status = 400;
		return { error: ERRORS.INVALID_TASK_STATUS };
	}

	const taskPriority = await getTaskPriorityById({ id: body.priority_id });
	if (!taskPriority) {
		set.status = 400;
		return { error: ERRORS.INVALID_TASK_PRIORITY };
	}

	const task = await createTask({
		...body,
		title: body.title.trim(),
		description: body.description.trim(),
		created_by: user.id,
		updated_by: user.id,
	});

	if (body.attachments?.length) {
		for (const mediaId of body.attachments) {
			await createTaskAttachment({
				task_id: task.id,
				media_id: mediaId,
				created_by: user.id,
				updated_by: user.id,
			});
		}
	}

	const createdTask = await getTaskById({ id: task.id });
	set.status = 201;
	return createdTask;
}

export async function updateTask({ params, body, user, set }) {
	const existingTask = await getTaskById(params);
	if (!existingTask) {
		set.status = 404;
		return { error: ERRORS.TASK_NOT_FOUND };
	}

	if (body.status_id) {
		const taskStatus = await getTaskStatusById({ id: body.status_id });
		if (!taskStatus) {
			set.status = 400;
			return { error: ERRORS.INVALID_TASK_STATUS };
		}
	}

	if (body.priority_id) {
		const taskPriority = await getTaskPriorityById({ id: body.priority_id });
		if (!taskPriority) {
			set.status = 400;
			return { error: ERRORS.INVALID_TASK_PRIORITY };
		}
	}

	const { attachments, ...taskFields } = body;

	if (taskFields.title) {
		taskFields.title = taskFields.title.trim();
	}
	if (taskFields.description) {
		taskFields.description = taskFields.description.trim();
	}

	await updateTaskById({
		id: params.id,
		...taskFields,
		updated_by: user.id,
	});

	if (attachments?.length) {
		await deleteTaskAttachmentsByTaskId({ task_id: params.id });
		for (const mediaId of attachments) {
			await createTaskAttachment({
				task_id: params.id,
				media_id: mediaId,
				created_by: user.id,
				updated_by: user.id,
			});
		}
	}

	const task = await getTaskById(params);
	set.status = 200;
	return task;
}

export async function deleteTask({ params, set }) {
	const existingTask = await getTaskById(params);
	if (!existingTask) {
		set.status = 404;
		return { error: ERRORS.TASK_NOT_FOUND };
	}

	deleteTaskById(params);
	set.status = 204;
	return;
}
