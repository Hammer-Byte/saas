import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createTaskStatus({ title, created_by = null, updated_by = null }) {
	const taskStatus = {
		title,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO TASK_STATUSES ${sql(taskStatus)}`,
	})
		.then((taskStatusInserted) => getTaskStatusById({ id: Number(taskStatusInserted.insertId) }))
		.catch((error) => logger.error(`createTaskStatus: ${error}`));
}

export async function getTaskStatusById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM TASK_STATUSES WHERE id = ${id}`,
	})
		.then((taskStatuses) => taskStatuses[0])
		.catch((error) => logger.error(`getTaskStatusById: ${error}`));
}

export async function getAllTaskStatuses() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM TASK_STATUSES ORDER BY id ASC`,
	})
		.then((taskStatuses) => taskStatuses)
		.catch((error) => logger.error(`getAllTaskStatuses: ${error}`));
}

export async function updateTaskStatusById({ id, ...taskStatus }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE TASK_STATUSES SET ${sql(taskStatus)} WHERE id = ${id}`,
	})
		.then(() => getTaskStatusById({ id }))
		.catch((error) => logger.error(`updateTaskStatusById: ${error}`));
}

export async function deleteTaskStatusById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM TASK_STATUSES WHERE id = ${id}`,
	})
		.then((taskStatusDeleted) => taskStatusDeleted)
		.catch((error) => logger.error(`deleteTaskStatusById: ${error}`));
}
