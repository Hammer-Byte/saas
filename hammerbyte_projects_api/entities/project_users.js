import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createProjectUser({
	project_id,
	user_id,
	active = true,
	created_by = null,
	updated_by = null,
}) {
	const projectUser = {
		project_id,
		user_id,
		active: !!active,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO PROJECT_USERS ${sql(projectUser)}`,
	})
		.then((projectUserInserted) =>
			getProjectUserById({ id: Number(projectUserInserted.insertId) }),
		)
		.catch((error) => logger.error(`createProjectUser: ${error}`));
}

export async function getProjectUserById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM PROJECT_USERS WHERE id = ${id}`,
	})
		.then((projectUsers) => {
			if (!projectUsers.length) {
				return;
			}

			return projectUsers[0];
		})
		.catch((error) => logger.error(`getProjectUserById: ${error}`));
}

export async function getProjectUsersByProjectId({ project_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM PROJECT_USERS WHERE project_id = ${project_id} ORDER BY id ASC`,
	})
		.then((projectUsers) => projectUsers)
		.catch((error) => logger.error(`getProjectUsersByProjectId: ${error}`));
}

export async function getProjectUserByProjectIdAndUserId({ project_id, user_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM PROJECT_USERS
				WHERE project_id = ${project_id} AND user_id = ${user_id}`,
	})
		.then((projectUsers) => {
			if (!projectUsers.length) {
				return;
			}

			return projectUsers[0];
		})
		.catch((error) => logger.error(`getProjectUserByProjectIdAndUserId: ${error}`));
}

export async function updateProjectUserById({ id, ...projectUser }) {
	if (Object.hasOwn(projectUser, "active")) {
		projectUser.active = !!projectUser.active;
	}

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`UPDATE PROJECT_USERS SET ${sql(projectUser)} WHERE id = ${id}`,
	})
		.then(() => getProjectUserById({ id }))
		.catch((error) => logger.error(`updateProjectUserById: ${error}`));
}

export async function deleteProjectUserById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM PROJECT_USERS WHERE id = ${id}`,
	})
		.then((projectUserDeleted) => projectUserDeleted)
		.catch((error) => logger.error(`deleteProjectUserById: ${error}`));
}

export async function deleteProjectUsersByProjectId({ project_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`DELETE FROM PROJECT_USERS WHERE project_id = ${project_id}`,
	})
		.then((projectUsersDeleted) => projectUsersDeleted)
		.catch((error) => logger.error(`deleteProjectUsersByProjectId: ${error}`));
}
