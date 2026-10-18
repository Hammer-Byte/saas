import { validationDetail } from "elysia";

const { CONSTANTS } = require("@hammerbyte/utils");

export const SWAGGER = {
	APPLICATION: "HammerByte Users API",
};

// Re-export for lints/middlewares + lints/server (must import HEADERS from constants.js).
// Literal HEADERS.AUTHENTICATION_TOKEN is banned by lints/microservice.
// eslint-disable-next-line lints/style -- required bridge export for middleware/server imports
export const HEADERS = CONSTANTS.HEADERS;

/** Session token lifetime after email OTP request (sahas auth_token_validity default: 30 days). */
export const AUTH_TOKEN_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000;

/** Config `key` values stored in CONFIGS (values are always strings in the table). */
export const CONFIGS = {
	AUTHENTICATION_TOKEN_MAIL_TEMPLATE_ID: "authentication_token_mail_template_id",
};

export const ERRORS = {
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
		CREATED_BY_REQUIRED: validationDetail("Created By Required"),
		UPDATED_BY_REQUIRED: validationDetail("Updated By Required"),
		TOKEN_REQUIRED: validationDetail("Token Required"),
		OTP_REQUIRED: validationDetail("OTP Required"),
		VALIDITY_REQUIRED: validationDetail("Validity Required"),
	},
};
