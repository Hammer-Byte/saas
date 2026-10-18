import { t } from "elysia";
import { getValidAuthenticationToken, requestAuthenticationToken, verifyAuthenticationTokenOtp } from "../../services/authentication_tokens.js";
import { ERRORS } from "../../constants.js";

export function authenticationTokens(app) {
	return app
		.post("/", requestAuthenticationToken, {
			body: t.Object({
				email: t.String({ minLength: 1, error: ERRORS.VALIDATION.EMAIL_REQUIRED }),
			}),
			detail: {
				tags: ["Authentication Tokens"],
				summary: "Request authentication token by email",
				description:
					"Creates an inactive authentication token with OTP for an existing user, emails the OTP using the configured mail template, and returns the authentication token.",
			},
		})
		.patch("/", verifyAuthenticationTokenOtp, {
			body: t.Object({
				authentication_token: t.String({
					minLength: 1,
					error: ERRORS.VALIDATION.TOKEN_REQUIRED,
				}),
				otp: t.String({
					minLength: 4,
					maxLength: 4,
					pattern: "^[0-9]{4}$",
					error: ERRORS.VALIDATION.OTP_REQUIRED,
				}),
			}),
			detail: {
				tags: ["Authentication Tokens"],
				summary: "Activate authentication token with OTP",
				description:
					"Validates OTP against an inactive token and activates it. Returns the user on success.",
			},
		});
}

export function validateAuthenticationToken(app) {
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
				"Public check for other microservices. 200 when the token exists and is active (with nested user); 401 when it exists but is inactive; 404 when it does not exist.",
		},
	});
}

export default authenticationTokens;
