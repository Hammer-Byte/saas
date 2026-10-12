import { validationDetail } from "elysia";

const { CONSTANTS } = require("@hammerbyte/utils");

export const SWAGGER = {
	APPLICATION: "HammerByte Media API",
};

/** Re-export shared auth header — do not redeclare keys that live in @hammerbyte/utils CONSTANTS. */
export const { HEADERS } = CONSTANTS;

export const STORAGE_PATH = Bun.env.STORAGE_PATH || "/var/www/storage";

export const STORAGE_DIRS = {
	MEDIA: "media",
};

export const ERRORS = {
	MEDIA_NOT_FOUND: "Media Not Found",
	MEDIA_FILE_NOT_FOUND: "Media File Not Found On Volume",
	VALIDATION: {
		ID_REQUIRED: validationDetail("Id Required"),
		NAME_REQUIRED: validationDetail("Name Required"),
		BINARY_REQUIRED: validationDetail("Binary Required"),
		PRIVATE_REQUIRED: validationDetail("Private Required"),
	},
};
