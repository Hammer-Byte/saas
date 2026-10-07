import { t } from "elysia";
import {
	deleteProjectApplication,
	getProjectApplication,
	updateProjectApplication,
} from "../../services/project_applications.js";
import { ERRORS } from "../../constants.js";

const applicationIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function projectApplications(app) {
	return app
		.get("/:id", getProjectApplication, {
			params: applicationIdParams,
			detail: {
				tags: ["Project Applications"],
				summary: "Get application",
				description: "Returns a single project application by id.",
			},
		})
		.patch("/:id", updateProjectApplication, {
			params: applicationIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
				description: t.Optional(
					t.String({ error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED }),
				),
				url: t.Optional(t.String({ error: ERRORS.VALIDATION.URL_REQUIRED })),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
			}),
			detail: {
				tags: ["Project Applications"],
				summary: "Update application",
				description: "Updates an existing project application.",
			},
		})
		.delete("/:id", deleteProjectApplication, {
			params: applicationIdParams,
			detail: {
				tags: ["Project Applications"],
				summary: "Delete application",
				description: "Deletes a project application by id.",
			},
		});
}
