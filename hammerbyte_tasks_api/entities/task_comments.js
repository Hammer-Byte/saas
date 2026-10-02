import { executeSQLQuery } from "../libs/db.js";
import {
	getTaskCommentAttachmentsByTaskCommentId,
	getTaskCommentAttachmentsByTaskId,
} from "./task_comment_attachments.js";

const { logger } = require("@hammerbyte/utils");

export async function createTaskComment({
	task_id,
	comment,
	created_by = null,
	updated_by = null,
}) {
	const taskComment = {
		task_id,
		comment,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO TASK_COMMENTS ${sql(taskComment)}`,
	})
		.then((taskCommentInserted) => getTaskCommentById({ id: Number(taskCommentInserted.insertId) }))
		.catch((error) => logger.error(`createTaskComment: ${error}`));
}

export async function getTaskCommentById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM TASK_COMMENTS WHERE id = ${id}`,
	})
		.then(async (taskComments) => {
			if (!taskComments.length) {
				return;
			}

			const taskComment = taskComments[0];
			taskComment.attachments = await getTaskCommentAttachmentsByTaskCommentId({
				task_comment_id: taskComment.id,
			});
			return taskComment;
		})
		.catch((error) => logger.error(`getTaskCommentById: ${error}`));
}

export async function getTaskCommentsByTaskId({ task_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM TASK_COMMENTS WHERE task_id = ${task_id} ORDER BY id ASC`,
	})
		.then(async (taskComments) => {
			const taskCommentAttachments = await getTaskCommentAttachmentsByTaskId({ task_id });
			const attachmentsByTaskCommentId = new Map();

			for (const taskCommentAttachment of taskCommentAttachments) {
				if (!attachmentsByTaskCommentId.has(taskCommentAttachment.task_comment_id)) {
					attachmentsByTaskCommentId.set(taskCommentAttachment.task_comment_id, []);
				}
				attachmentsByTaskCommentId
					.get(taskCommentAttachment.task_comment_id)
					.push(taskCommentAttachment);
			}

			for (const taskComment of taskComments) {
				taskComment.attachments = attachmentsByTaskCommentId.get(taskComment.id) || [];
			}

			return taskComments;
		})
		.catch((error) => logger.error(`getTaskCommentsByTaskId: ${error}`));
}

export async function updateTaskCommentById({ id, ...taskComment }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE TASK_COMMENTS SET ${sql(taskComment)} WHERE id = ${id}`,
	})
		.then(() => getTaskCommentById({ id }))
		.catch((error) => logger.error(`updateTaskCommentById: ${error}`));
}

export async function deleteTaskCommentById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM TASK_COMMENTS WHERE id = ${id}`,
	})
		.then((taskCommentDeleted) => taskCommentDeleted)
		.catch((error) => logger.error(`deleteTaskCommentById: ${error}`));
}
