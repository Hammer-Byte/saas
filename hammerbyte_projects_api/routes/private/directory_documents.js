import { t } from "elysia";
import {
	deleteDirectoryDocument,
	downloadDirectoryDocument,
	getDirectoryDocument,
} from "../../services/directory_documents.js";
import { ERRORS } from "../../constants.js";

const documentIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function directoryDocuments(app) {
	return app
		.get("/:id", getDirectoryDocument, {
			params: documentIdParams,
			detail: {
				tags: ["Directory Documents"],
				summary: "Get document",
				description: "Returns document metadata by id.",
			},
		})
		.get("/:id/download", downloadDirectoryDocument, {
			params: documentIdParams,
			detail: {
				tags: ["Directory Documents"],
				summary: "Download document",
				description: "Streams the file from the documents volume as an attachment.",
			},
		})
		.delete("/:id", deleteDirectoryDocument, {
			params: documentIdParams,
			detail: {
				tags: ["Directory Documents"],
				summary: "Delete document",
				description: "Deletes the file on volume and the metadata row.",
			},
		});
}
