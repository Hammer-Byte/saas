import { t } from "elysia";
import {
	deleteProjectUser,
	updateProjectUser,
} from "../../services/project_users.js";
import { ERRORS } from "../../constants.js";

const projectUserIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function projectUsers(app) {
	return app
		.patch("/:id", updateProjectUser, {
			params: projectUserIdParams,
			body: t.Object({
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
			}),
			detail: {
				tags: ["Project Users"],
				summary: "Update project member",
				description: "Updates a project membership (e.g. active flag).",
			},
		})
		.delete("/:id", deleteProjectUser, {
			params: projectUserIdParams,
			detail: {
				tags: ["Project Users"],
				summary: "Remove project member",
				description: "Deletes a project membership by id.",
			},
		});
}
