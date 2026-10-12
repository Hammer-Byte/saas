import { validationDetail } from "elysia";

const { CONSTANTS } = require("@hammerbyte/utils");

export const SWAGGER = {
	APPLICATION: "HammerByte Tasks API",
};

/** Re-export shared auth header — do not redeclare keys that live in @hammerbyte/utils CONSTANTS. */
export const { HEADERS } = CONSTANTS;

export const ERRORS = {
	TASK_NOT_FOUND: "Task Not Found",
	TASK_STATUS_NOT_FOUND: "Task Status Not Found",
	TASK_PRIORITY_NOT_FOUND: "Task Priority Not Found",
	TASK_COMMENT_NOT_FOUND: "Task Comment Not Found",
	INVALID_TASK_STATUS: "Invalid Task Status",
	INVALID_TASK_PRIORITY: "Invalid Task Priority",
	VALIDATION: {
		TITLE_REQUIRED: validationDetail("Title Required"),
		DESCRIPTION_REQUIRED: validationDetail("Description Required"),
		COMMENT_REQUIRED: validationDetail("Comment Required"),
		START_REQUIRED: validationDetail("Start Required"),
		END_REQUIRED: validationDetail("End Required"),
		ID_REQUIRED: validationDetail("Id Required"),
		TASK_ID_REQUIRED: validationDetail("Task Id Required"),
		PRIORITY_ID_REQUIRED: validationDetail("Priority Id Required"),
		STATUS_ID_REQUIRED: validationDetail("Status Id Required"),
		HANDLER_ID_REQUIRED: validationDetail("Handler Id Required"),
		DUE_AT_REQUIRED: validationDetail("Due At Required"),
		ATTACHMENTS_INVALID: validationDetail("Invalid Attachments"),
		MEDIA_ID_REQUIRED: validationDetail("Media Id Required"),
	},
};
