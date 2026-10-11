import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createTemplatePlaceHolder({
	template_id,
	place_holder,
	created_by = null,
	updated_by = null,
}) {
	const templatePlaceHolder = {
		template_id,
		place_holder,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`INSERT INTO PLACE_HOLDERS ${sql(templatePlaceHolder)}`,
	})
		.then((templatePlaceHolderInserted) =>
			getTemplatePlaceHolderById({ id: Number(templatePlaceHolderInserted.insertId) }),
		)
		.catch((error) => logger.error(`createTemplatePlaceHolder: ${error}`));
}

export async function getTemplatePlaceHolderById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM PLACE_HOLDERS WHERE id = ${id}`,
	})
		.then((templatePlaceHolders) => templatePlaceHolders[0])
		.catch((error) => logger.error(`getTemplatePlaceHolderById: ${error}`));
}

export async function getTemplatePlaceHoldersByTemplateId({ template_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM PLACE_HOLDERS
				WHERE template_id = ${template_id}
				ORDER BY id ASC`,
	}).catch((error) => logger.error(`getTemplatePlaceHoldersByTemplateId: ${error}`));
}

export async function updateTemplatePlaceHolderById({ id, ...templatePlaceHolder }) {
	await executeSQLQuery({
		queryFunction: (sql) =>
			sql`UPDATE PLACE_HOLDERS SET ${sql(templatePlaceHolder)} WHERE id = ${id}`,
	}).catch((error) => logger.error(`updateTemplatePlaceHolderById: ${error}`));
}

export async function deleteTemplatePlaceHolderById({ id }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM PLACE_HOLDERS WHERE id = ${id}`,
	}).catch((error) => logger.error(`deleteTemplatePlaceHolderById: ${error}`));
}
