import { t } from "elysia";
import {
	addAuthority,
	deleteAuthority,
	getAuthorities,
	getAuthority,
	updateAuthority,
} from "../../services/authorities.js";
import { ERRORS } from "../../constants.js";

const authorityIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function authorities(app) {
	return app
		.get("/", getAuthorities, {
			detail: {
				tags: ["Authorities"],
				summary: "List authorities",
				description: "Returns all authorities.",
			},
		})
		.get("/:id", getAuthority, {
			params: authorityIdParams,
			detail: {
				tags: ["Authorities"],
				summary: "Get authority",
				description: "Returns a single authority by id.",
			},
		})
		.post("/", addAuthority, {
			body: t.Object({
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				description: t.String({
					minLength: 1,
					error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED,
				}),
			}),
			detail: {
				tags: ["Authorities"],
				summary: "Create authority",
				description: "Creates a new authority. title and description are required.",
			},
		})
		.patch("/:id", updateAuthority, {
			params: authorityIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
				description: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED }),
				),
			}),
			detail: {
				tags: ["Authorities"],
				summary: "Update authority",
				description: "Updates an existing authority.",
			},
		})
		.delete("/:id", deleteAuthority, {
			params: authorityIdParams,
			detail: {
				tags: ["Authorities"],
				summary: "Delete authority",
				description: "Deletes an authority by id.",
			},
		});
}
