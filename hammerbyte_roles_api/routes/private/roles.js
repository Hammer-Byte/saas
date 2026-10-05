import { t } from "elysia";
import {
	addRole,
	deleteRole,
	getRole,
	getRoles,
	updateRole,
} from "../../services/roles.js";
import { ERRORS } from "../../constants.js";

const roleIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function roles(app) {
	return app
		.get("/", getRoles, {
			detail: {
				tags: ["Roles"],
				summary: "List roles",
				description: "Returns all roles, including tagged authorities.",
			},
		})
		.get("/:id", getRole, {
			params: roleIdParams,
			detail: {
				tags: ["Roles"],
				summary: "Get role",
				description: "Returns a single role by id, including tagged authorities.",
			},
		})
		.post("/", addRole, {
			body: t.Object({
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
				authorities: t.Optional(
					t.Array(
						t.Number({ minimum: 1, error: ERRORS.VALIDATION.AUTHORITY_ID_REQUIRED }),
						{ error: ERRORS.VALIDATION.AUTHORITIES_INVALID },
					),
				),
			}),
			detail: {
				tags: ["Roles"],
				summary: "Create role",
				description:
					"Creates a new role. title is required. authorities is an optional list of authority ids.",
			},
		})
		.patch("/:id", updateRole, {
			params: roleIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
				authorities: t.Optional(
					t.Array(
						t.Number({ minimum: 1, error: ERRORS.VALIDATION.AUTHORITY_ID_REQUIRED }),
						{ error: ERRORS.VALIDATION.AUTHORITIES_INVALID },
					),
				),
			}),
			detail: {
				tags: ["Roles"],
				summary: "Update role",
				description:
					"Updates an existing role. When authorities is provided, it replaces the set.",
			},
		})
		.delete("/:id", deleteRole, {
			params: roleIdParams,
			detail: {
				tags: ["Roles"],
				summary: "Delete role",
				description: "Deletes a role and its authority tags by id.",
			},
		});
}
