import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createRoleAuthority({
	role_id,
	authority_id,
	created_by = null,
	updated_by = null,
}) {
	const roleAuthority = {
		role_id,
		authority_id,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO ROLE_AUTHORITIES ${sql(roleAuthority)}`,
	})
		.then((roleAuthorityInserted) =>
			getRoleAuthorityById({ id: Number(roleAuthorityInserted.insertId) }),
		)
		.catch((error) => logger.error(`createRoleAuthority: ${error}`));
}

export async function getRoleAuthorityById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM ROLE_AUTHORITIES WHERE id = ${id}`,
	})
		.then((roleAuthorities) => roleAuthorities[0])
		.catch((error) => logger.error(`getRoleAuthorityById: ${error}`));
}

export async function getRoleAuthoritiesByRoleId({ role_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT
				ROLE_AUTHORITIES.id,
				ROLE_AUTHORITIES.role_id,
				ROLE_AUTHORITIES.authority_id,
				ROLE_AUTHORITIES.created_by,
				ROLE_AUTHORITIES.updated_by,
				ROLE_AUTHORITIES.created_at,
				ROLE_AUTHORITIES.updated_at,
				AUTHORITIES.title,
				AUTHORITIES.description
			FROM ROLE_AUTHORITIES
			INNER JOIN AUTHORITIES ON AUTHORITIES.id = ROLE_AUTHORITIES.authority_id
			WHERE ROLE_AUTHORITIES.role_id = ${role_id}
			ORDER BY AUTHORITIES.title ASC`,
	})
		.then((roleAuthorities) => roleAuthorities)
		.catch((error) => logger.error(`getRoleAuthoritiesByRoleId: ${error}`));
}

export async function getAllRoleAuthorities() {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT
				ROLE_AUTHORITIES.id,
				ROLE_AUTHORITIES.role_id,
				ROLE_AUTHORITIES.authority_id,
				ROLE_AUTHORITIES.created_by,
				ROLE_AUTHORITIES.updated_by,
				ROLE_AUTHORITIES.created_at,
				ROLE_AUTHORITIES.updated_at,
				AUTHORITIES.title,
				AUTHORITIES.description
			FROM ROLE_AUTHORITIES
			INNER JOIN AUTHORITIES ON AUTHORITIES.id = ROLE_AUTHORITIES.authority_id
			ORDER BY ROLE_AUTHORITIES.role_id ASC, AUTHORITIES.title ASC`,
	})
		.then((roleAuthorities) => roleAuthorities)
		.catch((error) => logger.error(`getAllRoleAuthorities: ${error}`));
}

export async function deleteRoleAuthoritiesByRoleId({ role_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM ROLE_AUTHORITIES WHERE role_id = ${role_id}`,
	})
		.then((roleAuthoritiesDeleted) => roleAuthoritiesDeleted)
		.catch((error) => logger.error(`deleteRoleAuthoritiesByRoleId: ${error}`));
}

export async function deleteRoleAuthorityById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM ROLE_AUTHORITIES WHERE id = ${id}`,
	})
		.then((roleAuthorityDeleted) => roleAuthorityDeleted)
		.catch((error) => logger.error(`deleteRoleAuthorityById: ${error}`));
}
