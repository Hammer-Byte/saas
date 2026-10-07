import {
	createRole,
	deleteRoleById,
	getAllRoles,
	getRoleById,
	updateRoleById,
} from "../entities/roles.js";
import {
	createRoleAuthority,
	deleteRoleAuthoritiesByRoleId,
} from "../entities/role_authorities.js";
import { getAuthorityById } from "../entities/authorities.js";
import { ERRORS } from "../constants.js";

export async function getRoles({ set }) {
	const roles = await getAllRoles();
	set.status = 200;
	return roles;
}

export async function getRole({ params, set }) {
	const role = await getRoleById(params);
	if (!role) {
		set.status = 404;
		return { error: ERRORS.ROLE_NOT_FOUND };
	}
	set.status = 200;
	return role;
}

export async function addRole({ body, user, set }) {
	if (body.authorities?.length) {
		for (const authorityId of body.authorities) {
			const authority = await getAuthorityById({ id: authorityId });
			if (!authority) {
				set.status = 400;
				return { error: ERRORS.INVALID_AUTHORITY };
			}
		}
	}

	const role = await createRole({
		title: body.title.trim(),
		active: Object.hasOwn(body, "active") ? body.active : true,
		admin: Object.hasOwn(body, "admin") ? body.admin : false,
		created_by: user.id,
		updated_by: user.id,
	});

	if (body.authorities?.length) {
		for (const authorityId of body.authorities) {
			await createRoleAuthority({
				role_id: role.id,
				authority_id: authorityId,
				created_by: user.id,
				updated_by: user.id,
			});
		}
	}

	const createdRole = await getRoleById({ id: role.id });
	set.status = 201;
	return createdRole;
}

export async function updateRole({ params, body, user, set }) {
	const existingRole = await getRoleById(params);
	if (!existingRole) {
		set.status = 404;
		return { error: ERRORS.ROLE_NOT_FOUND };
	}

	if (body.authorities?.length) {
		for (const authorityId of body.authorities) {
			const authority = await getAuthorityById({ id: authorityId });
			if (!authority) {
				set.status = 400;
				return { error: ERRORS.INVALID_AUTHORITY };
			}
		}
	}

	const { authorities, ...roleFields } = body;

	if (roleFields.title) {
		roleFields.title = roleFields.title.trim();
	}

	const roleUpdate = { updated_by: user.id };
	if (roleFields.title) {
		roleUpdate.title = roleFields.title;
	}
	if (Object.hasOwn(roleFields, "active")) {
		roleUpdate.active = roleFields.active;
	}
	if (Object.hasOwn(roleFields, "admin")) {
		roleUpdate.admin = roleFields.admin;
	}

	await updateRoleById({
		id: params.id,
		...roleUpdate,
	});

	if (Object.hasOwn(body, "authorities")) {
		await deleteRoleAuthoritiesByRoleId({ role_id: params.id });
		for (const authorityId of authorities || []) {
			await createRoleAuthority({
				role_id: params.id,
				authority_id: authorityId,
				created_by: user.id,
				updated_by: user.id,
			});
		}
	}

	const role = await getRoleById(params);
	set.status = 200;
	return role;
}

export async function deleteRole({ params, set }) {
	const existingRole = await getRoleById(params);
	if (!existingRole) {
		set.status = 404;
		return { error: ERRORS.ROLE_NOT_FOUND };
	}

	deleteRoleById(params);
	set.status = 204;
	return;
}
