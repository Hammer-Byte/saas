import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createTaskPriority({ title, created_by = null, updated_by = null }) {
	const taskPriority = {
		title,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO TASK_PRIORITIES ${sql(taskPriority)}`,
	})
		.then((taskPriorityInserted) => getTaskPriorityById({ id: Number(taskPriorityInserted.insertId) }))
		.catch((error) => logger.error(`createTaskPriority: ${error}`));
}

export async function getTaskPriorityById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM TASK_PRIORITIES WHERE id = ${id}`,
	})
		.then((taskPriorities) => taskPriorities[0])
		.catch((error) => logger.error(`getTaskPriorityById: ${error}`));
}

export async function getAllTaskPriorities() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM TASK_PRIORITIES ORDER BY id ASC`,
	})
		.then((taskPriorities) => taskPriorities)
		.catch((error) => logger.error(`getAllTaskPriorities: ${error}`));
}

export async function updateTaskPriorityById({ id, ...taskPriority }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE TASK_PRIORITIES SET ${sql(taskPriority)} WHERE id = ${id}`,
	})
		.then(() => getTaskPriorityById({ id }))
		.catch((error) => logger.error(`updateTaskPriorityById: ${error}`));
}

export async function deleteTaskPriorityById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM TASK_PRIORITIES WHERE id = ${id}`,
	})
		.then((taskPriorityDeleted) => taskPriorityDeleted)
		.catch((error) => logger.error(`deleteTaskPriorityById: ${error}`));
}
