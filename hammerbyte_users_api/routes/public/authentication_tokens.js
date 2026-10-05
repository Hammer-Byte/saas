import { t } from "elysia";
import { getValidAuthenticationToken } from "../../services/authentication_tokens.js";
import { ERRORS } from "../../constants.js";

export default function validateAuthenticationToken(app) {
	return app.get("/:authentication_token/validate", getValidAuthenticationToken, {
		params: t.Object({
			authentication_token: t.String({
				minLength: 1,
				error: ERRORS.VALIDATION.TOKEN_REQUIRED,
			}),
		}),
		detail: {
			tags: ["Authentication Tokens"],
			summary: "Validate authentication token",
			description:
				"Public check for other microservices. Returns the authentication token with nested user on 200 when the token is active and still within validity; otherwise 401.",
		},
	});
}
