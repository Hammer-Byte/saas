import { createTemplateType, deleteTemplateTypeById, getAllTemplateTypes, getTemplateTypeById, updateTemplateTypeById } from "../entities/template_types.js";
import { getTemplatesByTypeId } from "../entities/templates.js";
import { getEntityAudit } from "../apis/entity_audits.js";
import { ERRORS } from "../constants.js";

export async function populateAuditAttributes({ entity, authentication_token }) {
	return await getEntityAudit({ entity, authentication_token });
}

export async function getTemplateTypes({ set }) {
	const templateTypes = await getAllTemplateTypes();
	set.status = 200;
	return templateTypes;
}

export async function getTemplateType({ params, set }) {
	const templateType = await getTemplateTypeById({ id: params.id });
	if (!templateType) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_TYPE_NOT_FOUND };
	}
	set.status = 200;
	return templateType;
}

export async function addTemplateType({ body, user, set }) {
	const templateType = await createTemplateType({
		name: String(body.name).trim(),
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
	return templateType;
}

export async function updateTemplateType({ params, body, user, set }) {
	const templateType = await getTemplateTypeById({ id: params.id });
	if (!templateType) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_TYPE_NOT_FOUND };
	}

	const templateTypeUpdate = { updated_by: user.id };

	if (Object.hasOwn(body, "name") && body.name) {
		templateTypeUpdate.name = String(body.name).trim();
	}

	await updateTemplateTypeById({
		id: params.id,
		...templateTypeUpdate,
	});
	const updatedTemplateType = await getTemplateTypeById({ id: params.id });

	set.status = 200;
	return updatedTemplateType;
}

export async function deleteTemplateType({ params, set }) {
	const templateType = await getTemplateTypeById({ id: params.id });
	if (!templateType) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_TYPE_NOT_FOUND };
	}

	const templates = await getTemplatesByTypeId({ type_id: params.id });
	if (templates?.length) {
		set.status = 400;
		return { error: ERRORS.TEMPLATE_TYPE_IN_USE };
	}

	deleteTemplateTypeById({ id: params.id });
	set.status = 204;
}
