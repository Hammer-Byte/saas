import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createUser({
	email,
	password,
	full_name,
	active = true,
	created_by = null,
	updated_by = null,
}) {
	const user = {
		email,
		password,
		full_name,
		active: !!active,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO USERS ${sql(user)}`,
	})
		.then((userInserted) => getUserById({ id: Number(userInserted.insertId) }))
		.catch((error) => logger.error(`createUser: ${error}`));
}

export async function getUserById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM USERS WHERE id = ${id}`,
	})
		.then((users) => {
			if (!users.length) {
				return;
			}

			return users[0];
		})
		.catch((error) => logger.error(`getUserById: ${error}`));
}

export async function getUserByEmail({ email }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM USERS WHERE email = ${email}`,
	})
		.then((users) => {
			if (!users.length) {
				return;
			}

			return users[0];
		})
		.catch((error) => logger.error(`getUserByEmail: ${error}`));
}

export async function getAllUsers() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM USERS ORDER BY id ASC`,
	})
		.then((users) => users)
		.catch((error) => logger.error(`getAllUsers: ${error}`));
}

export async function getUserByActiveAuthenticationToken({ authentication_token }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT USERS.* FROM AUTHENTICATION_TOKENS
				LEFT JOIN USERS ON AUTHENTICATION_TOKENS.user_id = USERS.id
				WHERE AUTHENTICATION_TOKENS.token = ${authentication_token}
					AND AUTHENTICATION_TOKENS.active = true
					AND AUTHENTICATION_TOKENS.validity > CURRENT_TIMESTAMP`,
	})
		.then((users) => {
			if (!users.length) {
				logger.error("getUserByActiveAuthenticationToken: no matching user");
				return;
			}

			return users[0];
		})
		.catch((error) => logger.error(`getUserByActiveAuthenticationToken: ${error}`));
}

export async function updateUserById({ id, ...user }) {
	if (Object.hasOwn(user, "active")) {
		user.active = !!user.active;
	}

	return await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE USERS SET ${sql(user)} WHERE id = ${id}`,
	})
		.then(() => getUserById({ id }))
		.catch((error) => logger.error(`updateUserById: ${error}`));
}

export async function deleteUserById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM USERS WHERE id = ${id}`,
	})
		.then((userDeleted) => userDeleted)
		.catch((error) => logger.error(`deleteUserById: ${error}`));
}
