import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createDirectoryDocument({
	project_directory_id,
	title,
	stored_name,
	mime_type = "",
	size_bytes = 0,
	created_by = null,
	updated_by = null,
}) {
	const directoryDocument = {
		project_directory_id,
		title,
		stored_name,
		mime_type,
		size_bytes,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`INSERT INTO DIRECTORY_DOCUMENTS ${sql(directoryDocument)}`,
	})
		.then((directoryDocumentInserted) =>
			getDirectoryDocumentById({ id: Number(directoryDocumentInserted.insertId) }),
		)
		.catch((error) => logger.error(`createDirectoryDocument: ${error}`));
}

export async function getDirectoryDocumentById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM DIRECTORY_DOCUMENTS WHERE id = ${id}`,
	})
		.then((directoryDocuments) => {
			if (!directoryDocuments.length) {
				return;
			}

			return directoryDocuments[0];
		})
		.catch((error) => logger.error(`getDirectoryDocumentById: ${error}`));
}

export async function getDirectoryDocumentsByProjectDirectoryId({
	project_directory_id,
}) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM DIRECTORY_DOCUMENTS
				WHERE project_directory_id = ${project_directory_id}
				ORDER BY id ASC`,
	})
		.then((directoryDocuments) => directoryDocuments)
		.catch((error) =>
			logger.error(`getDirectoryDocumentsByProjectDirectoryId: ${error}`),
		);
}

export async function deleteDirectoryDocumentById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM DIRECTORY_DOCUMENTS WHERE id = ${id}`,
	})
		.then((directoryDocumentDeleted) => directoryDocumentDeleted)
		.catch((error) => logger.error(`deleteDirectoryDocumentById: ${error}`));
}

export async function deleteDirectoryDocumentsByProjectDirectoryId({
	project_directory_id,
}) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`DELETE FROM DIRECTORY_DOCUMENTS
				WHERE project_directory_id = ${project_directory_id}`,
	})
		.then((directoryDocumentsDeleted) => directoryDocumentsDeleted)
		.catch((error) =>
			logger.error(`deleteDirectoryDocumentsByProjectDirectoryId: ${error}`),
		);
}
