import { createTemplate, deleteTemplateById, getTemplateById, getTemplatesByServiceId, updateTemplateById } from "../entities/templates.js";
import { getTemplateTypeById } from "../entities/template_types.js";
import { getEntityAudit } from "../apis/entity_audits.js";
import { ERRORS } from "../constants.js";

export async function populateAuditAttributes({ entity, authentication_token }) {
	return await getEntityAudit({ entity, authentication_token });
}

export async function getTemplates({ query, set }) {
	const templates = await getTemplatesByServiceId({
		service_id: query.service_id,
	});
	set.status = 200;
	return templates;
}

export async function getTemplate({ params, set }) {
	const template = await getTemplateById({ id: params.id });
	if (!template) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_NOT_FOUND };
	}
	set.status = 200;
	return template;
}

export async function addTemplate({ body, user, set }) {
	const templateType = await getTemplateTypeById({ id: body.type_id });
	if (!templateType) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_TYPE_NOT_FOUND };
	}

	const template = await createTemplate({
		...body,
		title: String(body.title).trim(),
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
	return template;
}

export async function updateTemplate({ params, body, user, set }) {
	const template = await getTemplateById({ id: params.id });
	if (!template) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_NOT_FOUND };
	}

	const templateUpdate = { updated_by: user.id };

	if (Object.hasOwn(body, "title") && body.title) {
		templateUpdate.title = String(body.title).trim();
	}

	if (Object.hasOwn(body, "type_id")) {
		const templateType = await getTemplateTypeById({ id: body.type_id });
		if (!templateType) {
			set.status = 404;
			return { error: ERRORS.TEMPLATE_TYPE_NOT_FOUND };
		}
		templateUpdate.type_id = body.type_id;
	}

	if (Object.hasOwn(body, "media_id")) {
		templateUpdate.media_id = body.media_id;
	}

	await updateTemplateById({
		id: params.id,
		...templateUpdate,
	});
	const updatedTemplate = await getTemplateById({ id: params.id });

	set.status = 200;
	return updatedTemplate;
}

export async function deleteTemplate({ params, set }) {
	const template = await getTemplateById({ id: params.id });
	if (!template) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_NOT_FOUND };
	}

	deleteTemplateById({ id: params.id });
	set.status = 204;
}
