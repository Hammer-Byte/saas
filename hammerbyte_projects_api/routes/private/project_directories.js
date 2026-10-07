import { t } from "elysia";
import {
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

export default function projectDirectories(app) {
	return app
		.get("/:id", getProjectDirectory, {
			params: directoryIdParams,
			detail: {
				tags: ["Project Directories"],
				summary: "Get directory",
				description: "Returns a single project directory by id.",
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
				tags: ["Project Directories"],
				summary: "Update directory",
				description: "Updates directory title. Disk path stays ID-based.",
			},
		})
		.delete("/:id", deleteProjectDirectory, {
			params: directoryIdParams,
			detail: {
				tags: ["Project Directories"],
				summary: "Delete directory",
				description:
					"Deletes a directory subtree in the DB and removes folders on the volume.",
			},
		})
		.get("/:id/documents", getDirectoryDocuments, {
			params: directoryIdParams,
			detail: {
				tags: ["Directory Documents"],
				summary: "List documents",
				description: "Returns documents in a project directory.",
			},
		})
		.post("/:id/documents", addDirectoryDocument, {
			params: directoryIdParams,
			body: t.Object({
				file: t.File({ error: ERRORS.VALIDATION.FILE_REQUIRED }),
			}),
			detail: {
				tags: ["Directory Documents"],
				summary: "Upload document",
				description:
					"Multipart upload: file. Writes to volume and inserts metadata.",
			},
		});
}
