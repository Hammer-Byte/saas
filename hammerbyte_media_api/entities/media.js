import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createMedia({ name, file, created_by = null, updated_by = null }) {
	const media = {
		name,
		file,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO MEDIA ${sql(media)}`,
	})
		.then((mediaInserted) => getMediaById({ id: Number(mediaInserted.insertId) }))
		.catch((error) => logger.error(`createMedia: ${error}`));
}

export async function getMediaById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM MEDIA WHERE id = ${id}`,
	})
		.then((medias) => medias[0])
		.catch((error) => logger.error(`getMediaById: ${error}`));
}

export async function updateMediaById({ id, ...media }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE MEDIA SET ${sql(media)} WHERE id = ${id}`,
	}).catch((error) => logger.error(`updateMediaById: ${error}`));
}

export async function deleteMediaById({ id }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM MEDIA WHERE id = ${id}`,
	}).catch((error) => logger.error(`deleteMediaById: ${error}`));
}
