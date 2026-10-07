import { t } from "elysia";
import {
	addProject,
	deleteProject,
	getProject,
	getProjects,
	updateProject,
} from "../../services/projects.js";
import {
	addProjectUser,
	getProjectUsers,
} from "../../services/project_users.js";
import {
	addProjectDirectory,
	getProjectDirectories,
} from "../../services/project_directories.js";
import {
	addProjectApplication,
	getProjectApplications,
} from "../../services/project_applications.js";
import {
	addProjectInvoice,
	getProjectInvoices,
} from "../../services/project_invoices.js";
import { ERRORS } from "../../constants.js";

const projectIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function projects(app) {
	return app
		.get("/", getProjects, {
			query: t.Object({
				mine: t.Optional(t.Boolean()),
			}),
			detail: {
				tags: ["Projects"],
				summary: "List projects",
				description:
					"Returns all projects. Pass mine=true to return only projects the caller is a member of.",
			},
		})
		.get("/:id", getProject, {
			params: projectIdParams,
			detail: {
				tags: ["Projects"],
				summary: "Get project",
				description: "Returns a single project by id.",
			},
		})
		.post("/", addProject, {
			body: t.Object({
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				description: t.Optional(
					t.String({ error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED }),
				),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
			}),
			detail: {
				tags: ["Projects"],
				summary: "Create project",
				description:
					"Creates a project and adds the authenticated user as a member.",
			},
		})
		.patch("/:id", updateProject, {
			params: projectIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
				description: t.Optional(
					t.String({ error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED }),
				),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
			}),
			detail: {
				tags: ["Projects"],
				summary: "Update project",
				description: "Updates an existing project.",
			},
		})
		.delete("/:id", deleteProject, {
			params: projectIdParams,
			detail: {
				tags: ["Projects"],
				summary: "Delete project",
				description:
					"Deletes a project, related rows, and its documents volume tree.",
			},
		})
		.get("/:id/users", getProjectUsers, {
			params: projectIdParams,
			detail: {
				tags: ["Project Users"],
				summary: "List project members",
				description: "Returns all memberships for a project.",
			},
		})
		.post("/:id/users", addProjectUser, {
			params: projectIdParams,
			body: t.Object({
				user_id: t.Number({
					minimum: 1,
					error: ERRORS.VALIDATION.USER_ID_REQUIRED,
				}),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
			}),
			detail: {
				tags: ["Project Users"],
				summary: "Add project member",
				description: "Adds a user membership to a project.",
			},
		})
		.get("/:id/directories", getProjectDirectories, {
			params: projectIdParams,
			detail: {
				tags: ["Project Directories"],
				summary: "List directories",
				description:
					"Returns flat directories for a project. Build a tree via parent_id.",
			},
		})
		.post("/:id/directories", addProjectDirectory, {
			params: projectIdParams,
			body: t.Object({
				parent_id: t.Optional(
					t.Number({
						minimum: 1,
						error: ERRORS.VALIDATION.PARENT_ID_REQUIRED,
					}),
				),
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
			}),
			detail: {
				tags: ["Project Directories"],
				summary: "Create directory",
				description:
					"Creates a directory row and a matching folder on the documents volume.",
			},
		})
		.get("/:id/applications", getProjectApplications, {
			params: projectIdParams,
			detail: {
				tags: ["Project Applications"],
				summary: "List applications",
				description: "Returns applications for a project.",
			},
		})
		.post("/:id/applications", addProjectApplication, {
			params: projectIdParams,
			body: t.Object({
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				description: t.Optional(
					t.String({ error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED }),
				),
				url: t.Optional(t.String({ error: ERRORS.VALIDATION.URL_REQUIRED })),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
			}),
			detail: {
				tags: ["Project Applications"],
				summary: "Create application",
				description: "Creates a software/application under a project.",
			},
		})
		.get("/:id/invoices", getProjectInvoices, {
			params: projectIdParams,
			detail: {
				tags: ["Project Invoices"],
				summary: "List invoices",
				description: "Returns invoices for a project with items and computed total.",
			},
		})
		.post("/:id/invoices", addProjectInvoice, {
			params: projectIdParams,
			body: t.Object({
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				notes: t.Optional(t.String({ error: ERRORS.VALIDATION.NOTES_REQUIRED })),
				issued_at: t.String({
					minLength: 1,
					error: ERRORS.VALIDATION.ISSUED_AT_REQUIRED,
				}),
				due_at: t.Optional(
					t.String({ error: ERRORS.VALIDATION.DUE_AT_REQUIRED }),
				),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
				items: t.Optional(
					t.Array(
						t.Object({
							title: t.String({
								minLength: 1,
								error: ERRORS.VALIDATION.TITLE_REQUIRED,
							}),
							description: t.Optional(
								t.String({ error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED }),
							),
							quantity: t.Number({ error: ERRORS.VALIDATION.QUANTITY_REQUIRED }),
							unit_price: t.Number({
								error: ERRORS.VALIDATION.UNIT_PRICE_REQUIRED,
							}),
						}),
						{ error: ERRORS.VALIDATION.ITEMS_INVALID },
					),
				),
			}),
			detail: {
				tags: ["Project Invoices"],
				summary: "Create invoice",
				description: "Creates an invoice with optional nested items.",
			},
		});
}
