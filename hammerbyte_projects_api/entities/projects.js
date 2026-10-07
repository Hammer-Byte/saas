import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createProject({
	title,
	description = "",
	active = true,
	created_by = null,
	updated_by = null,
}) {
	const project = {
		title,
		description,
		active: !!active,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO PROJECTS ${sql(project)}`,
	})
		.then((projectInserted) => getProjectById({ id: Number(projectInserted.insertId) }))
		.catch((error) => logger.error(`createProject: ${error}`));
}

export async function getProjectById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM PROJECTS WHERE id = ${id}`,
	})
		.then((projects) => {
			if (!projects.length) {
				return;
			}

			return projects[0];
		})
		.catch((error) => logger.error(`getProjectById: ${error}`));
}

export async function getAllProjects() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM PROJECTS ORDER BY id ASC`,
	})
		.then((projects) => projects)
		.catch((error) => logger.error(`getAllProjects: ${error}`));
}

export async function getProjectsByUserId({ user_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT PROJECTS.*
				FROM PROJECTS
				INNER JOIN PROJECT_USERS ON PROJECT_USERS.project_id = PROJECTS.id
				WHERE PROJECT_USERS.user_id = ${user_id}
					AND PROJECT_USERS.active = true
				ORDER BY PROJECTS.id ASC`,
	})
		.then((projects) => projects)
		.catch((error) => logger.error(`getProjectsByUserId: ${error}`));
}

export async function updateProjectById({ id, ...project }) {
	if (Object.hasOwn(project, "active")) {
		project.active = !!project.active;
	}

	return await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE PROJECTS SET ${sql(project)} WHERE id = ${id}`,
	})
		.then(() => getProjectById({ id }))
		.catch((error) => logger.error(`updateProjectById: ${error}`));
}

export async function deleteProjectById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM PROJECTS WHERE id = ${id}`,
	})
		.then((projectDeleted) => projectDeleted)
		.catch((error) => logger.error(`deleteProjectById: ${error}`));
}
