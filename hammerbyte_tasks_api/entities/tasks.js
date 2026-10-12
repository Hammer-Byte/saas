import { executeSQLQuery } from "../libs/db.js";
import { getTaskAttachmentsByCreatedAtRange, getTaskAttachmentsByTaskId } from "./task_attachments.js";

const { logger, sql } = require("@hammerbyte/utils");

export async function createTask({ title, description, status_id, priority_id, due_at, start, end, handler_id = null, created_by = null, updated_by = null }) {
	const task = {
		title,
		description,
		status_id,
		priority_id,
		due_at: sql.prepareSQLDate({ value: due_at }),
		start: sql.prepareSQLTime({ value: start }),
		end: sql.prepareSQLTime({ value: end }),
		handler_id,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO TASKS ${sql(task)}`,
	})
		.then((taskInserted) => getTaskById({ id: Number(taskInserted.insertId) }))
		.catch((error) => logger.error(`createTask: ${error}`));
}

export async function getTaskById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM TASKS WHERE id = ${id}`,
	})
		.then(async (tasks) => {
			if (!tasks.length) {
				return;
			}

			const task = tasks[0];
			task.attachments = await getTaskAttachmentsByTaskId({ task_id: task.id });
			return task;
		})
		.catch((error) => logger.error(`getTaskById: ${error}`));
}

export async function getAllTasksByCreatedAtRange({ start, end }) {
	const createdAtStart = sql.prepareSQLDateTime({ value: start });
	const createdAtEnd = sql.prepareSQLDateTime({ value: end });

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM TASKS
				WHERE created_at >= ${createdAtStart}
					AND created_at <= ${createdAtEnd}
				ORDER BY id DESC`,
	})
		.then(async (tasks) => {
			const taskAttachments = await getTaskAttachmentsByCreatedAtRange({ start, end });
			const attachmentsByTaskId = new Map();

			for (const taskAttachment of taskAttachments) {
				if (!attachmentsByTaskId.has(taskAttachment.task_id)) {
					attachmentsByTaskId.set(taskAttachment.task_id, []);
				}
				attachmentsByTaskId.get(taskAttachment.task_id).push(taskAttachment);
			}

			for (const task of tasks) {
				task.attachments = attachmentsByTaskId.get(task.id) || [];
			}

			return tasks;
		})
		.catch((error) => logger.error(`getAllTasksByCreatedAtRange: ${error}`));
}

export async function updateTaskById({ id, ...task }) {
	if (task.due_at) {
		task.due_at = sql.prepareSQLDate({ value: task.due_at });
	}
	if (task.start) {
		task.start = sql.prepareSQLTime({ value: task.start });
	}
	if (task.end) {
		task.end = sql.prepareSQLTime({ value: task.end });
	}

	await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE TASKS SET ${sql(task)} WHERE id = ${id}`,
	}).catch((error) => logger.error(`updateTaskById: ${error}`));
}

export async function deleteTaskById({ id }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM TASKS WHERE id = ${id}`,
	}).catch((error) => logger.error(`deleteTaskById: ${error}`));
}
