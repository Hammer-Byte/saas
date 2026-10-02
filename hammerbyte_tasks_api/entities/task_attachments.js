import { executeSQLQuery, prepareSQLDateTime } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createTaskAttachment({
	task_id,
	media_id,
	created_by = null,
	updated_by = null,
}) {
	const taskAttachment = {
		task_id,
		media_id,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO TASK_ATTACHMENTS ${sql(taskAttachment)}`,
	})
		.then((taskAttachmentInserted) =>
			getTaskAttachmentById({ id: Number(taskAttachmentInserted.insertId) }),
		)
		.catch((error) => logger.error(`createTaskAttachment: ${error}`));
}

export async function getTaskAttachmentById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM TASK_ATTACHMENTS WHERE id = ${id}`,
	})
		.then((taskAttachments) => taskAttachments[0])
		.catch((error) => logger.error(`getTaskAttachmentById: ${error}`));
}

export async function getTaskAttachmentsByTaskId({ task_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM TASK_ATTACHMENTS WHERE task_id = ${task_id} ORDER BY id ASC`,
	})
		.then((taskAttachments) => taskAttachments)
		.catch((error) => logger.error(`getTaskAttachmentsByTaskId: ${error}`));
}

export async function getTaskAttachmentsByCreatedAtRange({ start, end }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT TASK_ATTACHMENTS.*
				FROM TASK_ATTACHMENTS
				INNER JOIN TASKS ON TASKS.id = TASK_ATTACHMENTS.task_id
				WHERE TASKS.created_at >= ${prepareSQLDateTime({ value: start })}
					AND TASKS.created_at <= ${prepareSQLDateTime({ value: end })}
				ORDER BY TASK_ATTACHMENTS.id ASC`,
	})
		.then((taskAttachments) => taskAttachments)
		.catch((error) => logger.error(`getTaskAttachmentsByCreatedAtRange: ${error}`));
}

export async function deleteTaskAttachmentsByTaskId({ task_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM TASK_ATTACHMENTS WHERE task_id = ${task_id}`,
	})
		.then((taskAttachmentsDeleted) => taskAttachmentsDeleted)
		.catch((error) => logger.error(`deleteTaskAttachmentsByTaskId: ${error}`));
}

export async function deleteTaskAttachmentById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM TASK_ATTACHMENTS WHERE id = ${id}`,
	})
		.then((taskAttachmentDeleted) => taskAttachmentDeleted)
		.catch((error) => logger.error(`deleteTaskAttachmentById: ${error}`));
}
