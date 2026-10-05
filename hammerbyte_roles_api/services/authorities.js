import {
	createAuthority,
	deleteAuthorityById,
	getAllAuthorities,
	getAuthorityById,
	updateAuthorityById,
} from "../entities/authorities.js";
import { ERRORS } from "../constants.js";

export async function getAuthorities({ set }) {
	const authorities = await getAllAuthorities();
	set.status = 200;
	return authorities;
}

export async function getAuthority({ params, set }) {
	const authority = await getAuthorityById(params);
	if (!authority) {
		set.status = 404;
		return { error: ERRORS.AUTHORITY_NOT_FOUND };
	}
	set.status = 200;
	return authority;
}

export async function addAuthority({ body, user, set }) {
	const authority = await createAuthority({
		title: body.title.trim(),
		description: body.description.trim(),
		created_by: user.id,
		updated_by: user.id,
	});
	set.status = 201;
	return authority;
}

export async function updateAuthority({ params, body, user, set }) {
	const existingAuthority = await getAuthorityById(params);
	if (!existingAuthority) {
		set.status = 404;
		return { error: ERRORS.AUTHORITY_NOT_FOUND };
	}

	const authorityUpdate = { updated_by: user.id };
	if (body.title) {
		authorityUpdate.title = body.title.trim();
	}
	if (body.description) {
		authorityUpdate.description = body.description.trim();
	}

	const authority = await updateAuthorityById({ id: params.id, ...authorityUpdate });
	set.status = 200;
	return authority;
}

export async function deleteAuthority({ params, set }) {
	const existingAuthority = await getAuthorityById(params);
	if (!existingAuthority) {
		set.status = 404;
		return { error: ERRORS.AUTHORITY_NOT_FOUND };
	}

	deleteAuthorityById(params);
	set.status = 204;
	return;
}
