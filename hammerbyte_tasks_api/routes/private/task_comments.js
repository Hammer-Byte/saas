import { t } from "elysia";
import {
	deleteTaskComment,
	getTaskComment,
	updateTaskComment,
} from "../../services/task_comments.js";
import { ERRORS } from "../../constants.js";

const taskCommentIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function taskComments(app) {
	return app
		.get("/:id", getTaskComment, {
			params: taskCommentIdParams,
			detail: {
				tags: ["Task Comments"],
				summary: "Get task comment",
				description: "Returns a single task comment by id, including attachments.",
			},
		})
		.patch("/:id", updateTaskComment, {
			params: taskCommentIdParams,
			body: t.Object({
				comment: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.COMMENT_REQUIRED }),
				),
				attachments: t.Optional(
					t.Array(
						t.Number({ minimum: 1, error: ERRORS.VALIDATION.MEDIA_ID_REQUIRED }),
						{ error: ERRORS.VALIDATION.ATTACHMENTS_INVALID },
					),
				),
			}),
			detail: {
				tags: ["Task Comments"],
				summary: "Update task comment",
				description:
					"Updates an existing task comment. When attachments is provided, it replaces the set.",
			},
		})
		.delete("/:id", deleteTaskComment, {
			params: taskCommentIdParams,
			detail: {
				tags: ["Task Comments"],
				summary: "Delete task comment",
				description: "Deletes a task comment and its attachments by id.",
			},
		});
}
