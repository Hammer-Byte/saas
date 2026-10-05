import { t } from "elysia";
import {
	addAuthenticationToken,
	deleteAuthenticationToken,
	getAuthenticationToken,
	getAuthenticationTokens,
	updateAuthenticationToken,
} from "../../services/authentication_tokens.js";
import { ERRORS } from "../../constants.js";

const authenticationTokenIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function authenticationTokens(app) {
	return app
		.get("/", getAuthenticationTokens, {
			detail: {
				tags: ["Authentication Tokens"],
				summary: "List authentication tokens",
				description: "Returns all authentication tokens.",
			},
		})
		.get("/:id", getAuthenticationToken, {
			params: authenticationTokenIdParams,
			detail: {
				tags: ["Authentication Tokens"],
				summary: "Get authentication token",
				description: "Returns a single authentication token by id.",
			},
		})
		.post("/", addAuthenticationToken, {
			body: t.Object({
				user_id: t.Number({
					minimum: 1,
					error: ERRORS.VALIDATION.USER_ID_REQUIRED,
				}),
				token: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TOKEN_REQUIRED }),
				),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
				validity: t.String({
					minLength: 1,
					error: ERRORS.VALIDATION.VALIDITY_REQUIRED,
				}),
			}),
			detail: {
				tags: ["Authentication Tokens"],
				summary: "Create authentication token",
				description:
					"Creates a new authentication token. user_id and validity are required; token is optional and generated when omitted.",
			},
		})
		.patch("/:id", updateAuthenticationToken, {
			params: authenticationTokenIdParams,
			body: t.Object({
				user_id: t.Optional(
					t.Number({ minimum: 1, error: ERRORS.VALIDATION.USER_ID_REQUIRED }),
				),
				token: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TOKEN_REQUIRED }),
				),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
				validity: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.VALIDITY_REQUIRED }),
				),
			}),
			detail: {
				tags: ["Authentication Tokens"],
				summary: "Update authentication token",
				description: "Updates an existing authentication token.",
			},
		})
		.delete("/:id", deleteAuthenticationToken, {
			params: authenticationTokenIdParams,
			detail: {
				tags: ["Authentication Tokens"],
				summary: "Delete authentication token",
				description: "Deletes an authentication token by id.",
			},
		});
}
