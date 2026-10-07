import { getProjectDirectoryById } from "../entities/project_directories.js";
import {
	createDirectoryDocument,
	deleteDirectoryDocumentById,
	getDirectoryDocumentById,
	getDirectoryDocumentsByProjectDirectoryId,
} from "../entities/directory_documents.js";
import {
	getDocumentFile,
	removeDocumentOnVolume,
	writeDocumentOnVolume,
} from "../libs/documents_volume.js";
import { ERRORS } from "../constants.js";
import { sanitizeStoredFileName } from "../util.js";

export async function getDirectoryDocuments({ params, set }) {
	const projectDirectory = await getProjectDirectoryById({
		id: params.id,
	});
	if (!projectDirectory) {
		set.status = 404;
		return { error: ERRORS.PROJECT_DIRECTORY_NOT_FOUND };
	}

	const directoryDocuments = await getDirectoryDocumentsByProjectDirectoryId({
		project_directory_id: params.id,
	});
	set.status = 200;
	return directoryDocuments;
}

export async function getDirectoryDocument({ params, set }) {
	const directoryDocument = await getDirectoryDocumentById(params);
	if (!directoryDocument) {
		set.status = 404;
		return { error: ERRORS.DIRECTORY_DOCUMENT_NOT_FOUND };
	}
	set.status = 200;
	return directoryDocument;
}

export async function addDirectoryDocument({ params, body, user, set }) {
	const projectDirectory = await getProjectDirectoryById({
		id: params.id,
	});
	if (!projectDirectory) {
		set.status = 404;
		return { error: ERRORS.PROJECT_DIRECTORY_NOT_FOUND };
	}

	const originalName = body.file.name || "file";
	const storedName = `${Date.now()}_${sanitizeStoredFileName({ name: originalName })}`;
	const mimeType = body.file.type || "";
	const sizeBytes = Number(body.file.size) || 0;

	await writeDocumentOnVolume({
		project_id: projectDirectory.project_id,
		directory_id: projectDirectory.id,
		stored_name: storedName,
		data: body.file,
	});

	const directoryDocument = await createDirectoryDocument({
		project_directory_id: projectDirectory.id,
		title: originalName,
		stored_name: storedName,
		mime_type: mimeType,
		size_bytes: sizeBytes,
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
	return directoryDocument;
}

export async function deleteDirectoryDocument({ params, set }) {
	const existingDocument = await getDirectoryDocumentById(params);
	if (!existingDocument) {
		set.status = 404;
		return { error: ERRORS.DIRECTORY_DOCUMENT_NOT_FOUND };
	}

	const projectDirectory = await getProjectDirectoryById({
		id: existingDocument.project_directory_id,
	});
	if (projectDirectory) {
		await removeDocumentOnVolume({
			project_id: projectDirectory.project_id,
			directory_id: projectDirectory.id,
			stored_name: existingDocument.stored_name,
		});
	}

	deleteDirectoryDocumentById(params);
	set.status = 204;
	return;
}

export async function downloadDirectoryDocument({ params, set }) {
	const directoryDocument = await getDirectoryDocumentById(params);
	if (!directoryDocument) {
		set.status = 404;
		return { error: ERRORS.DIRECTORY_DOCUMENT_NOT_FOUND };
	}

	const projectDirectory = await getProjectDirectoryById({
		id: directoryDocument.project_directory_id,
	});
	if (!projectDirectory) {
		set.status = 404;
		return { error: ERRORS.PROJECT_DIRECTORY_NOT_FOUND };
	}

	const file = await getDocumentFile({
		project_id: projectDirectory.project_id,
		directory_id: projectDirectory.id,
		stored_name: directoryDocument.stored_name,
	});
	if (!file) {
		set.status = 404;
		return { error: ERRORS.DOCUMENT_FILE_NOT_FOUND };
	}

	set.status = 200;
	set.headers["Content-Type"] = directoryDocument.mime_type || "application/octet-stream";
	set.headers["Content-Disposition"] =
		`attachment; filename="${directoryDocument.title.replace(/"/g, "")}"`;

	return file;
}
