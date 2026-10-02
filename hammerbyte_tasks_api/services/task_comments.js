import { getTaskById } from "../entities/tasks.js";
import {
	createTaskComment,
	deleteTaskCommentById,
	getTaskCommentById,
	getTaskCommentsByTaskId,
	updateTaskCommentById,
} from "../entities/task_comments.js";
import {
	createTaskCommentAttachment,
	deleteTaskCommentAttachmentsByTaskCommentId,
} from "../entities/task_comment_attachments.js";
import { ERRORS } from "../constants.js";

export async function getTaskComments({ params, set }) {
	const taskComments = await getTaskCommentsByTaskId({ task_id: params.id });
	set.status = 200;
	return taskComments;
}

export async function getTaskComment({ params, set }) {
	const taskComment = await getTaskCommentById(params);
	if (!taskComment) {
		set.status = 404;
		return { error: ERRORS.TASK_COMMENT_NOT_FOUND };
	}
	set.status = 200;
	return taskComment;
}

export async function addTaskComment({ params, body, user, set }) {
	const task = await getTaskById(params);
	if (!task) {
		set.status = 404;
		return { error: ERRORS.TASK_NOT_FOUND };
	}

	const taskComment = await createTaskComment({
		task_id: params.id,
		comment: body.comment.trim(),
		created_by: user.id,
		updated_by: user.id,
	});

	if (body.attachments?.length) {
		for (const mediaId of body.attachments) {
			await createTaskCommentAttachment({
				task_comment_id: taskComment.id,
				media_id: mediaId,
				created_by: user.id,
				updated_by: user.id,
			});
		}
	}

	const createdTaskComment = await getTaskCommentById({ id: taskComment.id });
	set.status = 201;
	return createdTaskComment;
}

export async function updateTaskComment({ params, body, user, set }) {
	const existingTaskComment = await getTaskCommentById(params);
	if (!existingTaskComment) {
		set.status = 404;
		return { error: ERRORS.TASK_COMMENT_NOT_FOUND };
	}

	const { attachments, ...taskCommentFields } = body;

	if (taskCommentFields.comment) {
		taskCommentFields.comment = taskCommentFields.comment.trim();
	}

	await updateTaskCommentById({
		id: params.id,
		...taskCommentFields,
		updated_by: user.id,
	});

	if (attachments?.length) {
		await deleteTaskCommentAttachmentsByTaskCommentId({ task_comment_id: params.id });
		for (const mediaId of attachments) {
			await createTaskCommentAttachment({
				task_comment_id: params.id,
				media_id: mediaId,
				created_by: user.id,
				updated_by: user.id,
			});
		}
	}

	const taskComment = await getTaskCommentById(params);
	set.status = 200;
	return taskComment;
}

export async function deleteTaskComment({ params, set }) {
	const existingTaskComment = await getTaskCommentById(params);
	if (!existingTaskComment) {
		set.status = 404;
		return { error: ERRORS.TASK_COMMENT_NOT_FOUND };
	}

	deleteTaskCommentById(params);
	set.status = 204;
	return;
}
