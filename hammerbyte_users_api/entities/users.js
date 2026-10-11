import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createUser({ email, full_name, active = true, created_by = null, updated_by = null }) {
	const user = {
		email,
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
		.then((users) => users[0])
		.catch((error) => logger.error(`getUserById: ${error}`));
}

export async function getUserByEmail({ email }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM USERS WHERE email = ${email}`,
	})
		.then((users) => users[0])
		.catch((error) => logger.error(`getUserByEmail: ${error}`));
}

export async function getAllUsers() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM USERS ORDER BY id ASC`,
	}).catch((error) => logger.error(`getAllUsers: ${error}`));
}

export async function getUsersByIds({ ids }) {
	if (!ids.length) {
		return [];
	}

	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM USERS WHERE id IN ${sql(ids)} ORDER BY id ASC`,
	}).catch((error) => logger.error(`getUsersByIds: ${error}`));
}

export async function updateUserById({ id, ...user }) {
	if (Object.hasOwn(user, "active")) {
		user.active = !!user.active;
	}

	await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE USERS SET ${sql(user)} WHERE id = ${id}`,
	}).catch((error) => logger.error(`updateUserById: ${error}`));
}

export async function deleteUserById({ id }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM USERS WHERE id = ${id}`,
	}).catch((error) => logger.error(`deleteUserById: ${error}`));
}
