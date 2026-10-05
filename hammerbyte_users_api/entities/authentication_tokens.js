import { executeSQLQuery, prepareSQLDateTime } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createAuthenticationToken({
	user_id,
	token,
	active = true,
	validity,
	created_by = null,
	updated_by = null,
}) {
	const authenticationToken = {
		user_id,
		token,
		active: !!active,
		validity: prepareSQLDateTime({ value: validity }),
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`INSERT INTO AUTHENTICATION_TOKENS ${sql(authenticationToken)}`,
	})
		.then((authenticationTokenInserted) =>
			getAuthenticationTokenById({ id: Number(authenticationTokenInserted.insertId) }),
		)
		.catch((error) => logger.error(`createAuthenticationToken: ${error}`));
}

export async function getAuthenticationTokenById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM AUTHENTICATION_TOKENS WHERE id = ${id}`,
	})
		.then((authenticationTokens) => {
			if (!authenticationTokens.length) {
				return;
			}

			return authenticationTokens[0];
		})
		.catch((error) => logger.error(`getAuthenticationTokenById: ${error}`));
}

export async function getAuthenticationTokenByToken({ token }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM AUTHENTICATION_TOKENS WHERE token = ${token}`,
	})
		.then((authenticationTokens) => {
			if (!authenticationTokens.length) {
				return;
			}

			return authenticationTokens[0];
		})
		.catch((error) => logger.error(`getAuthenticationTokenByToken: ${error}`));
}

export async function getActiveAuthenticationTokenByToken({ token }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM AUTHENTICATION_TOKENS
				WHERE token = ${token}
					AND active = true
					AND validity > CURRENT_TIMESTAMP`,
	})
		.then((authenticationTokens) => {
			if (!authenticationTokens.length) {
				return;
			}

			return authenticationTokens[0];
		})
		.catch((error) => logger.error(`getActiveAuthenticationTokenByToken: ${error}`));
}

export async function getAllAuthenticationTokens() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM AUTHENTICATION_TOKENS ORDER BY id ASC`,
	})
		.then((authenticationTokens) => authenticationTokens)
		.catch((error) => logger.error(`getAllAuthenticationTokens: ${error}`));
}

export async function getAuthenticationTokensByUserId({ user_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM AUTHENTICATION_TOKENS WHERE user_id = ${user_id} ORDER BY id ASC`,
	})
		.then((authenticationTokens) => authenticationTokens)
		.catch((error) => logger.error(`getAuthenticationTokensByUserId: ${error}`));
}

export async function updateAuthenticationTokenById({ id, ...authenticationToken }) {
	if (Object.hasOwn(authenticationToken, "active")) {
		authenticationToken.active = !!authenticationToken.active;
	}

	if (Object.hasOwn(authenticationToken, "validity")) {
		authenticationToken.validity = prepareSQLDateTime({
			value: authenticationToken.validity,
		});
	}

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`UPDATE AUTHENTICATION_TOKENS SET ${sql(authenticationToken)} WHERE id = ${id}`,
	})
		.then(() => getAuthenticationTokenById({ id }))
		.catch((error) => logger.error(`updateAuthenticationTokenById: ${error}`));
}

export async function deleteAuthenticationTokenById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM AUTHENTICATION_TOKENS WHERE id = ${id}`,
	})
		.then((authenticationTokenDeleted) => authenticationTokenDeleted)
		.catch((error) => logger.error(`deleteAuthenticationTokenById: ${error}`));
}

export async function deleteAuthenticationTokensByUserId({ user_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`DELETE FROM AUTHENTICATION_TOKENS WHERE user_id = ${user_id}`,
	})
		.then((authenticationTokensDeleted) => authenticationTokensDeleted)
		.catch((error) => logger.error(`deleteAuthenticationTokensByUserId: ${error}`));
}
