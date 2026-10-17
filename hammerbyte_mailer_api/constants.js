import { validationDetail } from "elysia";

const { CONSTANTS } = require("@hammerbyte/utils");

export const SWAGGER = {
	APPLICATION: "HammerByte Mailer API",
};

/** Re-export shared auth header — do not redeclare keys that live in @hammerbyte/utils CONSTANTS. */
export const { HEADERS } = CONSTANTS;

export const ERRORS = {
	EMAIL_BATCH_NOT_FOUND: "Email Batch Not Found",
	EMAIL_NOT_FOUND: "Email Not Found",
	INVALID_EMAILS_PAYLOAD: "Invalid Emails Payload",
	HTML_REQUIRED: "Html Required",
	RECIPIENTS_REQUIRED: "Recipients Required",
	MEDIA_ID_REQUIRED: "Media Id Required",
	MEDIA_NOT_FOUND: "Media Not Found",
	VALIDATION: {
		ID_REQUIRED: validationDetail("Id Required"),
		INTERVAL_REQUIRED: validationDetail("Interval Required"),
		EMAILS_REQUIRED: validationDetail("Emails Required"),
		SUBJECT_REQUIRED: validationDetail("Subject Required"),
		HTML_REQUIRED: validationDetail("Html Required"),
		ACTIVE_REQUIRED: validationDetail("Active Required"),
	},
};
