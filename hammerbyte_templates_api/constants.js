import { validationDetail } from "elysia";

const { CONSTANTS } = require("@hammerbyte/utils");

export const SWAGGER = {
	APPLICATION: "HammerByte Templates API",
};

/** Re-export shared auth header — do not redeclare keys that live in @hammerbyte/utils CONSTANTS. */
export const { HEADERS } = CONSTANTS;

export const ERRORS = {
	TEMPLATE_TYPE_NOT_FOUND: "Template Type Not Found",
	TEMPLATE_TYPE_IN_USE: "Template Type Has Templates And Cannot Be Deleted",
	TEMPLATE_NOT_FOUND: "Template Not Found",
	PLACEHOLDER_NOT_FOUND: "Placeholder Not Found",
	VALIDATION: {
		ID_REQUIRED: validationDetail("Id Required"),
		NAME_REQUIRED: validationDetail("Name Required"),
		TITLE_REQUIRED: validationDetail("Title Required"),
		SERVICE_ID_REQUIRED: validationDetail("Service Id Required"),
		TYPE_ID_REQUIRED: validationDetail("Type Id Required"),
		MEDIA_ID_REQUIRED: validationDetail("Media Id Required"),
		PLACE_HOLDER_REQUIRED: validationDetail("Place Holder Required"),
	},
};
