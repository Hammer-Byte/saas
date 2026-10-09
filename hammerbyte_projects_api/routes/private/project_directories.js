import { t } from "elysia";
import {
	addChildDirectory,
	deleteProjectDirectory,
	getProjectDirectory,
	updateProjectDirectory,
} from "../../services/project_directories.js";
import {
	addDirectoryDocument,
	getDirectoryDocuments,
} from "../../services/directory_documents.js";
import { ERRORS } from "../../constants.js";

const directoryIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function directories(app) {
	return app
		.get("/:id", getProjectDirectory, {
			params: directoryIdParams,
			detail: {
				tags: ["Directories"],
				summary: "Get directory",
				description: "Returns a single directory by id.",
			},
		})
		.patch("/:id", updateProjectDirectory, {
			params: directoryIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
			}),
			detail: {
				tags: ["Directories"],
				summary: "Update directory",
				description: "Updates directory title. Disk path stays ID-based.",
			},
		})
		.delete("/:id", deleteProjectDirectory, {
			params: directoryIdParams,
			detail: {
				tags: ["Directories"],
				summary: "Delete directory",
				description:
					"Deletes a directory subtree in the DB and removes folders on the volume. The project root directory (parent_id null) cannot be deleted.",
			},
		})
		.post("/:id/directory", addChildDirectory, {
			params: directoryIdParams,
			body: t.Object({
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
			}),
			detail: {
				tags: ["Directories"],
				summary: "Create child directory",
				description:
					"Creates a new directory inside directories/:id. parent_id is taken from the path.",
			},
		})
		.get("/:id/documents", getDirectoryDocuments, {
			params: directoryIdParams,
			detail: {
				tags: ["Documents"],
				summary: "List documents",
				description: "Returns documents in a directory.",
			},
		})
		.post("/:id/document", addDirectoryDocument, {
			params: directoryIdParams,
			body: t.Object({
				file: t.File({ error: ERRORS.VALIDATION.FILE_REQUIRED }),
			}),
			detail: {
				tags: ["Documents"],
				summary: "Upload document",
				description:
					"Multipart upload: file. Creates a document inside directories/:id.",
			},
		});
}
