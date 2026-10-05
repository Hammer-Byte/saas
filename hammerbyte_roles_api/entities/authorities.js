import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createAuthority({
	title,
	description,
	created_by = null,
	updated_by = null,
}) {
	const authority = {
		title,
		description,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO AUTHORITIES ${sql(authority)}`,
	})
		.then((authorityInserted) => getAuthorityById({ id: Number(authorityInserted.insertId) }))
		.catch((error) => logger.error(`createAuthority: ${error}`));
}

export async function getAuthorityById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM AUTHORITIES WHERE id = ${id}`,
	})
		.then((authorities) => authorities[0])
		.catch((error) => logger.error(`getAuthorityById: ${error}`));
}

export async function getAllAuthorities() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM AUTHORITIES ORDER BY title ASC`,
	})
		.then((authorities) => authorities)
		.catch((error) => logger.error(`getAllAuthorities: ${error}`));
}

export async function updateAuthorityById({ id, ...authority }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE AUTHORITIES SET ${sql(authority)} WHERE id = ${id}`,
	})
		.then(() => getAuthorityById({ id }))
		.catch((error) => logger.error(`updateAuthorityById: ${error}`));
}

export async function deleteAuthorityById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM AUTHORITIES WHERE id = ${id}`,
	})
		.then((authorityDeleted) => authorityDeleted)
		.catch((error) => logger.error(`deleteAuthorityById: ${error}`));
}
