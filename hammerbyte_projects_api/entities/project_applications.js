import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createProjectApplication({
	project_id,
	title,
	description = "",
	url = "",
	active = true,
	created_by = null,
	updated_by = null,
}) {
	const projectApplication = {
		project_id,
		title,
		description,
		url,
		active: !!active,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`INSERT INTO PROJECT_APPLICATIONS ${sql(projectApplication)}`,
	})
		.then((projectApplicationInserted) =>
			getProjectApplicationById({ id: Number(projectApplicationInserted.insertId) }),
		)
		.catch((error) => logger.error(`createProjectApplication: ${error}`));
}

export async function getProjectApplicationById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM PROJECT_APPLICATIONS WHERE id = ${id}`,
	})
		.then((projectApplications) => {
			if (!projectApplications.length) {
				return;
			}

			return projectApplications[0];
		})
		.catch((error) => logger.error(`getProjectApplicationById: ${error}`));
}

export async function getProjectApplicationsByProjectId({ project_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM PROJECT_APPLICATIONS
				WHERE project_id = ${project_id}
				ORDER BY id ASC`,
	})
		.then((projectApplications) => projectApplications)
		.catch((error) => logger.error(`getProjectApplicationsByProjectId: ${error}`));
}

export async function updateProjectApplicationById({ id, ...projectApplication }) {
	if (Object.hasOwn(projectApplication, "active")) {
		projectApplication.active = !!projectApplication.active;
	}

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`UPDATE PROJECT_APPLICATIONS SET ${sql(projectApplication)} WHERE id = ${id}`,
	})
		.then(() => getProjectApplicationById({ id }))
		.catch((error) => logger.error(`updateProjectApplicationById: ${error}`));
}

export async function deleteProjectApplicationById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM PROJECT_APPLICATIONS WHERE id = ${id}`,
	})
		.then((projectApplicationDeleted) => projectApplicationDeleted)
		.catch((error) => logger.error(`deleteProjectApplicationById: ${error}`));
}
