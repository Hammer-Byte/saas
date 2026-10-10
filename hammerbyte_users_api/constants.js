import { validationDetail } from "elysia";

export const SWAGGER = {
	APPLICATION: "HammerByte Users API",
};

export const HEADERS = {
	AUTHENTICATION_TOKEN: "authentication-token",
};

/** Session token lifetime after email OTP request (sahas auth_token_validity default: 30 days). */
export const AUTH_TOKEN_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

export const ERRORS = {
	UNAUTHORIZED: "Unauthorized",
	MISSING_INVALID_AUTHENTICATION_TOKEN: "Missing or Invalid Authentication Token",
	USER_NOT_FOUND: "User Not Found",
	AUTHENTICATION_TOKEN_NOT_FOUND: "Authentication Token Not Found",
	INVALID_USER: "Invalid User",
	INVALID_OTP: "Invalid OTP",
	VALIDATION: {
		EMAIL_REQUIRED: validationDetail("Email Required"),
		FULL_NAME_REQUIRED: validationDetail("Full Name Required"),
		ID_REQUIRED: validationDetail("Id Required"),
		ACTIVE_REQUIRED: validationDetail("Active Required"),
		USER_ID_REQUIRED: validationDetail("User Id Required"),
		TOKEN_REQUIRED: validationDetail("Token Required"),
		OTP_REQUIRED: validationDetail("OTP Required"),
		VALIDITY_REQUIRED: validationDetail("Validity Required"),
	},
};
