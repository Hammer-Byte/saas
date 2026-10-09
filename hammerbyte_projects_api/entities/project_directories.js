import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createProjectDirectory({
	project_id,
	parent_id = null,
	title,
	created_by = null,
	updated_by = null,
}) {
	const projectDirectory = {
		project_id,
		parent_id,
		title,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`INSERT INTO PROJECT_DIRECTORIES ${sql(projectDirectory)}`,
	})
		.then((projectDirectoryInserted) =>
			getProjectDirectoryById({ id: Number(projectDirectoryInserted.insertId) }),
		)
		.catch((error) => logger.error(`createProjectDirectory: ${error}`));
}

export async function getProjectDirectoryById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM PROJECT_DIRECTORIES WHERE id = ${id}`,
	})
		.then((projectDirectories) => {
			if (!projectDirectories.length) {
				return;
			}

			return projectDirectories[0];
		})
		.catch((error) => logger.error(`getProjectDirectoryById: ${error}`));
}

export async function getProjectDirectoriesByProjectId({ project_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM PROJECT_DIRECTORIES
				WHERE project_id = ${project_id}
				ORDER BY id ASC`,
	})
		.then((projectDirectories) => projectDirectories)
		.catch((error) => logger.error(`getProjectDirectoriesByProjectId: ${error}`));
}

export async function getProjectDirectoriesByParentId({ parent_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM PROJECT_DIRECTORIES
				WHERE parent_id = ${parent_id}
				ORDER BY id ASC`,
	})
		.then((projectDirectories) => projectDirectories)
		.catch((error) => logger.error(`getProjectDirectoriesByParentId: ${error}`));
}

export async function getRootProjectDirectoryByProjectId({ project_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM PROJECT_DIRECTORIES
				WHERE project_id = ${project_id}
					AND parent_id IS NULL
				ORDER BY id ASC
				LIMIT 1`,
	})
		.then((projectDirectories) => {
			if (!projectDirectories.length) {
				return;
			}

			return projectDirectories[0];
		})
		.catch((error) => logger.error(`getRootProjectDirectoryByProjectId: ${error}`));
}

export async function updateProjectDirectoryById({ id, ...projectDirectory }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`UPDATE PROJECT_DIRECTORIES SET ${sql(projectDirectory)} WHERE id = ${id}`,
	})
		.then(() => getProjectDirectoryById({ id }))
		.catch((error) => logger.error(`updateProjectDirectoryById: ${error}`));
}

export async function deleteProjectDirectoryById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM PROJECT_DIRECTORIES WHERE id = ${id}`,
	})
		.then((projectDirectoryDeleted) => projectDirectoryDeleted)
		.catch((error) => logger.error(`deleteProjectDirectoryById: ${error}`));
}

/** Collect self + all descendant directory ids from one project-scoped fetch. */
export async function getProjectDirectoryDescendantIds({ id }) {
	const rootDirectory = await getProjectDirectoryById({ id });
	if (!rootDirectory) {
		return [];
	}

	const projectDirectories = await getProjectDirectoriesByProjectId({
		project_id: rootDirectory.project_id,
	});
	const childrenByParentId = new Map();

	for (const projectDirectory of projectDirectories || []) {
		const parentKey = projectDirectory.parent_id || 0;
		if (!childrenByParentId.has(parentKey)) {
			childrenByParentId.set(parentKey, []);
		}
		childrenByParentId.get(parentKey).push(projectDirectory.id);
	}

	const allIds = [id];
	let frontier = [id];

	while (frontier.length) {
		const nextFrontier = [];
		for (const parentId of frontier) {
			const childIds = childrenByParentId.get(parentId) || [];
			for (const childId of childIds) {
				allIds.push(childId);
				nextFrontier.push(childId);
			}
		}
		frontier = nextFrontier;
	}

	return allIds;
}
