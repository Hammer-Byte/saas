import { t } from "elysia";
import {
	addUser,
	deleteUser,
	getUser,
	getUsers,
	updateUser,
} from "../../services/users.js";
import { ERRORS } from "../../constants.js";

const userIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function users(app) {
	return app
		.get("/", getUsers, {
			detail: {
				tags: ["Users"],
				summary: "List users",
				description: "Returns all users (password omitted).",
			},
		})
		.get("/:id", getUser, {
			params: userIdParams,
			detail: {
				tags: ["Users"],
				summary: "Get user",
				description: "Returns a single user by id (password omitted).",
			},
		})
		.post("/", addUser, {
			body: t.Object({
				email: t.String({ minLength: 1, error: ERRORS.VALIDATION.EMAIL_REQUIRED }),
				password: t.String({ minLength: 1, error: ERRORS.VALIDATION.PASSWORD_REQUIRED }),
				full_name: t.String({
					minLength: 1,
					error: ERRORS.VALIDATION.FULL_NAME_REQUIRED,
				}),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
			}),
			detail: {
				tags: ["Users"],
				summary: "Create user",
				description: "Creates a new user. email, password, and full_name are required.",
			},
		})
		.patch("/:id", updateUser, {
			params: userIdParams,
			body: t.Object({
				email: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.EMAIL_REQUIRED }),
				),
				password: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.PASSWORD_REQUIRED }),
				),
				full_name: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.FULL_NAME_REQUIRED }),
				),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
			}),
			detail: {
				tags: ["Users"],
				summary: "Update user",
				description: "Updates an existing user. Only provided fields are changed.",
			},
		})
		.delete("/:id", deleteUser, {
			params: userIdParams,
			detail: {
				tags: ["Users"],
				summary: "Delete user",
				description: "Deletes a user and cascaded authentication tokens by id.",
			},
		});
}
