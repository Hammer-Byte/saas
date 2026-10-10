import { validationDetail } from "elysia";

export const SWAGGER = {
	APPLICATION: "HammerByte Notifier API",
};

export const HEADERS = {
	AUTHENTICATION_TOKEN: "authentication-token",
};

export const STORAGE_PATH = Bun.env.STORAGE_PATH || "/var/www/storage";

export const STORAGE_DIRS = {
	TEMPLATES: "templates",
	ATTACHMENTS: "attachments",
};

export const ERRORS = {
	MISSING_INVALID_AUTHENTICATION_TOKEN: "Missing or Invalid Authentication Token",
	TEMPLATE_NOT_FOUND: "Template Not Found",
	PLACEHOLDER_NOT_FOUND: "Placeholder Not Found",
	EMAIL_BATCH_NOT_FOUND: "Email Batch Not Found",
	EMAIL_NOT_FOUND: "Email Not Found",
	TEMPLATE_IN_USE: "Template Has Email Batches And Cannot Be Deleted",
	MISSING_PLACEHOLDER_INJECT: "Missing Placeholder Inject Value",
	INVALID_EMAILS_PAYLOAD: "Invalid Emails Payload",
	ATTACHMENT_FILE_REQUIRED: "Attachment File Required",
	TEMPLATE_FILE_REQUIRED: "Template File Required",
	VALIDATION: {
		ID_REQUIRED: validationDetail("Id Required"),
		TITLE_REQUIRED: validationDetail("Title Required"),
		FILE_REQUIRED: validationDetail("File Required"),
		PLACE_HOLDER_REQUIRED: validationDetail("Place Holder Required"),
		INTERVAL_REQUIRED: validationDetail("Interval Required"),
		TEMPLATE_ID_REQUIRED: validationDetail("Template Id Required"),
		EMAILS_REQUIRED: validationDetail("Emails Required"),
		SUBJECT_REQUIRED: validationDetail("Subject Required"),
		ACTIVE_REQUIRED: validationDetail("Active Required"),
	},
};
