import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createTaskCommentAttachment({
	task_comment_id,
	media_id,
	created_by = null,
	updated_by = null,
}) {
	const taskCommentAttachment = {
		task_comment_id,
		media_id,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`INSERT INTO TASK_COMMENT_ATTACHMENTS ${sql(taskCommentAttachment)}`,
	})
		.then((taskCommentAttachmentInserted) =>
			getTaskCommentAttachmentById({ id: Number(taskCommentAttachmentInserted.insertId) }),
		)
		.catch((error) => logger.error(`createTaskCommentAttachment: ${error}`));
}

export async function getTaskCommentAttachmentById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM TASK_COMMENT_ATTACHMENTS WHERE id = ${id}`,
	})
		.then((taskCommentAttachments) => taskCommentAttachments[0])
		.catch((error) => logger.error(`getTaskCommentAttachmentById: ${error}`));
}

export async function getTaskCommentAttachmentsByTaskCommentId({ task_comment_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM TASK_COMMENT_ATTACHMENTS
				WHERE task_comment_id = ${task_comment_id}
				ORDER BY id ASC`,
	})
		.then((taskCommentAttachments) => taskCommentAttachments)
		.catch((error) => logger.error(`getTaskCommentAttachmentsByTaskCommentId: ${error}`));
}

export async function getTaskCommentAttachmentsByTaskId({ task_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT TASK_COMMENT_ATTACHMENTS.*
				FROM TASK_COMMENT_ATTACHMENTS
				INNER JOIN TASK_COMMENTS
					ON TASK_COMMENTS.id = TASK_COMMENT_ATTACHMENTS.task_comment_id
				WHERE TASK_COMMENTS.task_id = ${task_id}
				ORDER BY TASK_COMMENT_ATTACHMENTS.id ASC`,
	})
		.then((taskCommentAttachments) => taskCommentAttachments)
		.catch((error) => logger.error(`getTaskCommentAttachmentsByTaskId: ${error}`));
}

export async function deleteTaskCommentAttachmentsByTaskCommentId({ task_comment_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`DELETE FROM TASK_COMMENT_ATTACHMENTS WHERE task_comment_id = ${task_comment_id}`,
	})
		.then((taskCommentAttachmentsDeleted) => taskCommentAttachmentsDeleted)
		.catch((error) => logger.error(`deleteTaskCommentAttachmentsByTaskCommentId: ${error}`));
}

export async function deleteTaskCommentAttachmentById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM TASK_COMMENT_ATTACHMENTS WHERE id = ${id}`,
	})
		.then((taskCommentAttachmentDeleted) => taskCommentAttachmentDeleted)
		.catch((error) => logger.error(`deleteTaskCommentAttachmentById: ${error}`));
}
