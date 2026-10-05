import { validationDetail } from "elysia";

export const SWAGGER = {
	APPLICATION: "HammerByte Users API",
};

export const HEADERS = {
	AUTHENTICATION_TOKEN: "authentication-token",
};

export const ERRORS = {
	UNAUTHORIZED: "Unauthorized",
	MISSING_INVALID_AUTHENTICATION_TOKEN: "Missing or Invalid Authentication Token",
	USER_NOT_FOUND: "User Not Found",
	AUTHENTICATION_TOKEN_NOT_FOUND: "Authentication Token Not Found",
	INVALID_USER: "Invalid User",
	VALIDATION: {
		EMAIL_REQUIRED: validationDetail("Email Required"),
		PASSWORD_REQUIRED: validationDetail("Password Required"),
		FIRST_NAME_REQUIRED: validationDetail("First Name Required"),
		LAST_NAME_REQUIRED: validationDetail("Last Name Required"),
		ID_REQUIRED: validationDetail("Id Required"),
		ACTIVE_REQUIRED: validationDetail("Active Required"),
		USER_ID_REQUIRED: validationDetail("User Id Required"),
		TOKEN_REQUIRED: validationDetail("Token Required"),
		VALIDITY_REQUIRED: validationDetail("Validity Required"),
	},
};
