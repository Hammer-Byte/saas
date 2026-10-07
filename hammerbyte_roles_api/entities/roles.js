import { executeSQLQuery } from "../libs/db.js";
import {
	getAllRoleAuthorities,
	getRoleAuthoritiesByRoleId,
} from "./role_authorities.js";

const { logger } = require("@hammerbyte/utils");

export async function createRole({
	title,
	active = true,
	admin = false,
	created_by = null,
	updated_by = null,
}) {
	const role = {
		title,
		active: !!active,
		admin: !!admin,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO ROLES ${sql(role)}`,
	})
		.then((roleInserted) => getRoleById({ id: Number(roleInserted.insertId) }))
		.catch((error) => logger.error(`createRole: ${error}`));
}

export async function getRoleById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM ROLES WHERE id = ${id}`,
	})
		.then(async (roles) => {
			if (!roles.length) {
				return;
			}

			const role = roles[0];
			role.authorities = await getRoleAuthoritiesByRoleId({ role_id: role.id });
			return role;
		})
		.catch((error) => logger.error(`getRoleById: ${error}`));
}

export async function getAllRoles() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM ROLES ORDER BY id ASC`,
	})
		.then(async (roles) => {
			const roleAuthorities = await getAllRoleAuthorities();
			const authoritiesByRoleId = new Map();

			for (const roleAuthority of roleAuthorities) {
				if (!authoritiesByRoleId.has(roleAuthority.role_id)) {
					authoritiesByRoleId.set(roleAuthority.role_id, []);
				}
				authoritiesByRoleId.get(roleAuthority.role_id).push(roleAuthority);
			}

			for (const role of roles) {
				role.authorities = authoritiesByRoleId.get(role.id) || [];
			}

			return roles;
		})
		.catch((error) => logger.error(`getAllRoles: ${error}`));
}

export async function updateRoleById({ id, ...role }) {
	if (Object.hasOwn(role, "active")) {
		role.active = !!role.active;
	}
	if (Object.hasOwn(role, "admin")) {
		role.admin = !!role.admin;
	}

	return await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE ROLES SET ${sql(role)} WHERE id = ${id}`,
	})
		.then(() => getRoleById({ id }))
		.catch((error) => logger.error(`updateRoleById: ${error}`));
}

export async function deleteRoleById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM ROLES WHERE id = ${id}`,
	})
		.then((roleDeleted) => roleDeleted)
		.catch((error) => logger.error(`deleteRoleById: ${error}`));
}
