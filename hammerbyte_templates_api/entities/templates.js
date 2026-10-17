import { executeSQLQuery } from "../libs/db.js";
import { getAllTemplatePlaceHolders, getTemplatePlaceHoldersByTemplateId } from "./template_place_holders.js";

const { logger } = require("@hammerbyte/utils");

export async function createTemplate({ service_id, type_id, title, media_id, created_by = null, updated_by = null }) {
	const template = {
		service_id,
		type_id,
		title,
		media_id,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO TEMPLATES ${sql(template)}`,
	})
		.then((templateInserted) => getTemplateById({ id: Number(templateInserted.insertId) }))
		.catch((error) => logger.error(`createTemplate: ${error}`));
}

export async function getTemplateById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM TEMPLATES WHERE id = ${id}`,
	})
		.then(async (templates) => {
			if (!templates.length) {
				return;
			}

			const template = templates[0];
			template.place_holders = await getTemplatePlaceHoldersByTemplateId({
				template_id: template.id,
			});
			return template;
		})
		.catch((error) => logger.error(`getTemplateById: ${error}`));
}

export async function getTemplatesByServiceId({ service_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM TEMPLATES WHERE service_id = ${service_id} ORDER BY id ASC`,
	})
		.then(async (templates) => {
			const placeHolders = await getAllTemplatePlaceHolders();
			const placeHoldersByTemplateId = new Map();

			for (const placeHolder of placeHolders) {
				if (!placeHoldersByTemplateId.has(placeHolder.template_id)) {
					placeHoldersByTemplateId.set(placeHolder.template_id, []);
				}
				placeHoldersByTemplateId.get(placeHolder.template_id).push(placeHolder);
			}

			for (const template of templates) {
				template.place_holders = placeHoldersByTemplateId.get(template.id) || [];
			}

			return templates;
		})
		.catch((error) => logger.error(`getTemplatesByServiceId: ${error}`));
}

export async function getTemplatesByTypeId({ type_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM TEMPLATES WHERE type_id = ${type_id} ORDER BY id ASC`,
	}).catch((error) => logger.error(`getTemplatesByTypeId: ${error}`));
}

export async function updateTemplateById({ id, ...template }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE TEMPLATES SET ${sql(template)} WHERE id = ${id}`,
	}).catch((error) => logger.error(`updateTemplateById: ${error}`));
}

export async function deleteTemplateById({ id }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM TEMPLATES WHERE id = ${id}`,
	}).catch((error) => logger.error(`deleteTemplateById: ${error}`));
}
