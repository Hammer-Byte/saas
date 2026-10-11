import { validationDetail } from "elysia";

const { CONSTANTS } = require("@hammerbyte/utils");

export const SWAGGER = {
	APPLICATION: "HammerByte Roles API",
};

export const HEADERS = { ...CONSTANTS.HEADERS };

export const ERRORS = {
	ROLE_NOT_FOUND: "Role Not Found",
	AUTHORITY_NOT_FOUND: "Authority Not Found",
	INVALID_AUTHORITY: "Invalid Authority",
	VALIDATION: {
		TITLE_REQUIRED: validationDetail("Title Required"),
		DESCRIPTION_REQUIRED: validationDetail("Description Required"),
		ID_REQUIRED: validationDetail("Id Required"),
		ACTIVE_REQUIRED: validationDetail("Active Required"),
		ADMIN_REQUIRED: validationDetail("Admin Required"),
		AUTHORITIES_INVALID: validationDetail("Invalid Authorities"),
		AUTHORITY_ID_REQUIRED: validationDetail("Authority Id Required"),
	},
};
