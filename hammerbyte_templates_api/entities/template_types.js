import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createTemplateType({ name, created_by = null, updated_by = null }) {
	const templateType = {
		name,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO TEMPLATE_TYPES ${sql(templateType)}`,
	})
		.then((templateTypeInserted) =>
			getTemplateTypeById({ id: Number(templateTypeInserted.insertId) }),
		)
		.catch((error) => logger.error(`createTemplateType: ${error}`));
}

export async function getTemplateTypeById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM TEMPLATE_TYPES WHERE id = ${id}`,
	})
		.then((templateTypes) => templateTypes[0])
		.catch((error) => logger.error(`getTemplateTypeById: ${error}`));
}

export async function getAllTemplateTypes() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM TEMPLATE_TYPES ORDER BY id ASC`,
	}).catch((error) => logger.error(`getAllTemplateTypes: ${error}`));
}

export async function updateTemplateTypeById({ id, ...templateType }) {
	await executeSQLQuery({
		queryFunction: (sql) =>
			sql`UPDATE TEMPLATE_TYPES SET ${sql(templateType)} WHERE id = ${id}`,
	}).catch((error) => logger.error(`updateTemplateTypeById: ${error}`));
}

export async function deleteTemplateTypeById({ id }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM TEMPLATE_TYPES WHERE id = ${id}`,
	}).catch((error) => logger.error(`deleteTemplateTypeById: ${error}`));
}
