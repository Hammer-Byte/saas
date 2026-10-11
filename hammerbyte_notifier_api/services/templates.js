import { createTemplate, deleteTemplateById, getAllTemplates, getTemplateById, updateTemplateById } from "../entities/templates.js";
import { getEmailBatchesByTemplateId } from "../entities/email_batches.js";
import { removeStorageFile, writeTemplateFile } from "../libs/storage.js";
import { ERRORS } from "../constants.js";
import { populateAuditAttributes, populateAuditAttributesList } from "./populate_audit_attributes.js";

export async function getTemplates({ set, authentication_token }) {
	const templates = await getAllTemplates();
	await populateAuditAttributesList({ entities: templates, authentication_token });
	const placeholders = [];
	for (const template of templates || []) {
		for (const placeholder of template.placeholders || []) {
			placeholders.push(placeholder);
		}
	}
	await populateAuditAttributesList({ entities: placeholders, authentication_token });
	set.status = 200;
	return templates;
}

export async function getTemplate({ params, set, authentication_token }) {
	const template = await getTemplateById({ id: params.id });
	if (!template) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_NOT_FOUND };
	}
	await populateAuditAttributes({ entity: template, authentication_token });
	await populateAuditAttributesList({
		entities: template.placeholders || [],
		authentication_token,
	});
	set.status = 200;
	return template;
}

export async function addTemplate({ body, user, set, authentication_token }) {
	const filePath = await writeTemplateFile({ data: body.file });
	const template = await createTemplate({
		title: String(body.title).trim(),
		file: filePath,
		created_by: user.id,
		updated_by: user.id,
	});

	await populateAuditAttributes({ entity: template, authentication_token });
	await populateAuditAttributesList({
		entities: template?.placeholders || [],
		authentication_token,
	});
	set.status = 201;
	return template;
}

export async function updateTemplate({ params, body, user, set, authentication_token }) {
	const template = await getTemplateById({ id: params.id });
	if (!template) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_NOT_FOUND };
	}

	const templateUpdate = { updated_by: user.id };

	if (Object.hasOwn(body, "title") && body.title) {
		templateUpdate.title = String(body.title).trim();
	}

	if (body.file) {
		const filePath = await writeTemplateFile({ data: body.file });
		await removeStorageFile({ path: template.file });
		templateUpdate.file = filePath;
	}

	await updateTemplateById({
		id: params.id,
		...templateUpdate,
	});
	const updatedTemplate = await getTemplateById({ id: params.id });
	await populateAuditAttributes({ entity: updatedTemplate, authentication_token });
	await populateAuditAttributesList({
		entities: updatedTemplate?.placeholders || [],
		authentication_token,
	});

	set.status = 200;
	return updatedTemplate;
}

export async function deleteTemplate({ params, set }) {
	const template = await getTemplateById({ id: params.id });
	if (!template) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_NOT_FOUND };
	}

	const emailBatches = await getEmailBatchesByTemplateId({
		template_id: params.id,
	});
	if (emailBatches?.length) {
		set.status = 400;
		return { error: ERRORS.TEMPLATE_IN_USE };
	}

	await removeStorageFile({ path: template.file });
	deleteTemplateById({ id: params.id });
	set.status = 204;
}
