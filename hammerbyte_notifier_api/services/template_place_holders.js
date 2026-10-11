import { getTemplateById } from "../entities/templates.js";
import { createTemplatePlaceHolder, deleteTemplatePlaceHolderById, getTemplatePlaceHolderById, getTemplatePlaceHoldersByTemplateId, updateTemplatePlaceHolderById } from "../entities/template_place_holders.js";
import { ERRORS } from "../constants.js";

export async function getPlaceHolders({ params, set }) {
	const template = await getTemplateById({ id: params.id });
	if (!template) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_NOT_FOUND };
	}

	const placeholders = await getTemplatePlaceHoldersByTemplateId({
		template_id: params.id,
	});
	set.status = 200;
	return placeholders;
}

export async function addPlaceHolder({ params, body, user, set }) {
	const template = await getTemplateById({ id: params.id });
	if (!template) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_NOT_FOUND };
	}

	const placeholder = await createTemplatePlaceHolder({
		template_id: params.id,
		place_holder: String(body.place_holder).trim(),
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
	return placeholder;
}

export async function updatePlaceHolder({ params, body, user, set }) {
	const template = await getTemplateById({ id: params.id });
	if (!template) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_NOT_FOUND };
	}

	const placeholder = await getTemplatePlaceHolderById({
		id: params.placeholderId,
	});
	if (!placeholder || placeholder.template_id !== params.id) {
		set.status = 404;
		return { error: ERRORS.PLACEHOLDER_NOT_FOUND };
	}

	await updateTemplatePlaceHolderById({
		id: params.placeholderId,
		place_holder: String(body.place_holder).trim(),
		updated_by: user.id,
	});
	const updatedPlaceholder = await getTemplatePlaceHolderById({
		id: params.placeholderId,
	});

	set.status = 200;
	return updatedPlaceholder;
}

export async function deletePlaceHolder({ params, set }) {
	const template = await getTemplateById({ id: params.id });
	if (!template) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_NOT_FOUND };
	}

	const placeholder = await getTemplatePlaceHolderById({
		id: params.placeholderId,
	});
	if (!placeholder || placeholder.template_id !== params.id) {
		set.status = 404;
		return { error: ERRORS.PLACEHOLDER_NOT_FOUND };
	}

	deleteTemplatePlaceHolderById({ id: params.placeholderId });
	set.status = 204;
}
