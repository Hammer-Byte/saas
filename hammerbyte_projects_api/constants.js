import { validationDetail } from "elysia";

export const SWAGGER = {
	APPLICATION: "HammerByte Projects API",
};

export const HEADERS = {
	AUTHENTICATION_TOKEN: "authentication-token",
};

export const DOCUMENTS_VOLUME_PATH =
	Bun.env.DOCUMENTS_VOLUME_PATH || "/data/documents";

export const ERRORS = {
	UNAUTHORIZED: "Unauthorized",
	MISSING_INVALID_AUTHENTICATION_TOKEN: "Missing or Invalid Authentication Token",
	PROJECT_NOT_FOUND: "Project Not Found",
	PROJECT_USER_NOT_FOUND: "Project User Not Found",
	PROJECT_DIRECTORY_NOT_FOUND: "Project Directory Not Found",
	DIRECTORY_DOCUMENT_NOT_FOUND: "Directory Document Not Found",
	PROJECT_APPLICATION_NOT_FOUND: "Project Application Not Found",
	PROJECT_INVOICE_NOT_FOUND: "Project Invoice Not Found",
	INVOICE_LINE_NOT_FOUND: "Invoice Line Not Found",
	INVALID_PARENT_DIRECTORY: "Invalid Parent Directory",
	DOCUMENT_FILE_REQUIRED: "Document File Required",
	DOCUMENT_FILE_NOT_FOUND: "Document File Not Found On Volume",
	VALIDATION: {
		TITLE_REQUIRED: validationDetail("Title Required"),
		DESCRIPTION_REQUIRED: validationDetail("Description Required"),
		ID_REQUIRED: validationDetail("Id Required"),
		PROJECT_ID_REQUIRED: validationDetail("Project Id Required"),
		USER_ID_REQUIRED: validationDetail("User Id Required"),
		PROJECT_DIRECTORY_ID_REQUIRED: validationDetail("Project Directory Id Required"),
		PROJECT_INVOICE_ID_REQUIRED: validationDetail("Project Invoice Id Required"),
		PARENT_ID_REQUIRED: validationDetail("Parent Id Required"),
		URL_REQUIRED: validationDetail("Url Required"),
		ACTIVE_REQUIRED: validationDetail("Active Required"),
		NOTES_REQUIRED: validationDetail("Notes Required"),
		ISSUED_AT_REQUIRED: validationDetail("Issued At Required"),
		DUE_AT_REQUIRED: validationDetail("Due At Required"),
		QUANTITY_REQUIRED: validationDetail("Quantity Required"),
		UNIT_PRICE_REQUIRED: validationDetail("Unit Price Required"),
		FILE_REQUIRED: validationDetail("File Required"),
		ITEMS_INVALID: validationDetail("Invalid Items"),
	},
};
