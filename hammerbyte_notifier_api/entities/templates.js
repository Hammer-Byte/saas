import { executeSQLQuery } from "../libs/db.js";
import { getTemplatePlaceHoldersByTemplateId } from "./template_place_holders.js";

const { logger } = require("@hammerbyte/utils");

async function populateTemplatePlaceHolders({ template }) {
	template.placeholders = await getTemplatePlaceHoldersByTemplateId({
		template_id: template.id,
	});
	return template;
}

export async function createTemplate({ title, file, created_by = null, updated_by = null }) {
	const template = { title, file, created_by, updated_by };

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO EMAIL_TEMPLATES ${sql(template)}`,
	})
		.then((templateInserted) =>
			getTemplateById({ id: Number(templateInserted.insertId) }),
		)
		.catch((error) => logger.error(`createTemplate: ${error}`));
}

export async function getTemplateById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_TEMPLATES WHERE id = ${id}`,
	})
		.then(async (templates) => {
			if (!templates.length) {
				return;
			}

			return populateTemplatePlaceHolders({ template: templates[0] });
		})
		.catch((error) => logger.error(`getTemplateById: ${error}`));
}

export async function getAllTemplates() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_TEMPLATES ORDER BY id ASC`,
	})
		.then(async (templates) => {
			for (const template of templates) {
				await populateTemplatePlaceHolders({ template });
			}
			return templates;
		})
		.catch((error) => logger.error(`getAllTemplates: ${error}`));
}

export async function updateTemplateById({ id, ...template }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE EMAIL_TEMPLATES SET ${sql(template)} WHERE id = ${id}`,
	}).catch((error) => logger.error(`updateTemplateById: ${error}`));
}

export async function deleteTemplateById({ id }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM EMAIL_TEMPLATES WHERE id = ${id}`,
	}).catch((error) => logger.error(`deleteTemplateById: ${error}`));
}
