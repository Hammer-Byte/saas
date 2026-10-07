import { getProjectById } from "../entities/projects.js";
import {
	createProjectDirectory,
	deleteProjectDirectoryById,
	getProjectDirectoriesByProjectId,
	getProjectDirectoryById,
	getProjectDirectoryDescendantIds,
	updateProjectDirectoryById,
} from "../entities/project_directories.js";
import {
	createDirectoryOnVolume,
	removeDirectoryOnVolume,
} from "../libs/documents_volume.js";
import { ERRORS } from "../constants.js";

export async function getProjectDirectories({ params, set }) {
	const project = await getProjectById({ id: params.id });
	if (!project) {
		set.status = 404;
		return { error: ERRORS.PROJECT_NOT_FOUND };
	}

	const projectDirectories = await getProjectDirectoriesByProjectId({
		project_id: params.id,
	});
	set.status = 200;
	return projectDirectories;
}

export async function getProjectDirectory({ params, set }) {
	const projectDirectory = await getProjectDirectoryById(params);
	if (!projectDirectory) {
		set.status = 404;
		return { error: ERRORS.PROJECT_DIRECTORY_NOT_FOUND };
	}
	set.status = 200;
	return projectDirectory;
}

export async function addProjectDirectory({ params, body, user, set }) {
	const project = await getProjectById({ id: params.id });
	if (!project) {
		set.status = 404;
		return { error: ERRORS.PROJECT_NOT_FOUND };
	}

	if (body.parent_id) {
		const parentDirectory = await getProjectDirectoryById({ id: body.parent_id });
		if (!parentDirectory || parentDirectory.project_id !== params.id) {
			set.status = 400;
			return { error: ERRORS.INVALID_PARENT_DIRECTORY };
		}
	}

	const projectDirectory = await createProjectDirectory({
		...body,
		project_id: params.id,
		parent_id: body.parent_id || null,
		title: body.title.trim(),
		created_by: user.id,
		updated_by: user.id,
	});

	await createDirectoryOnVolume({
		project_id: projectDirectory.project_id,
		directory_id: projectDirectory.id,
	});

	set.status = 201;
	return projectDirectory;
}

export async function updateProjectDirectory({ params, body, user, set }) {
	const existingDirectory = await getProjectDirectoryById(params);
	if (!existingDirectory) {
		set.status = 404;
		return { error: ERRORS.PROJECT_DIRECTORY_NOT_FOUND };
	}

	const directoryUpdate = { updated_by: user.id };
	if (body.title) {
		directoryUpdate.title = body.title.trim();
	}

	await updateProjectDirectoryById({
		id: params.id,
		...directoryUpdate,
	});

	const projectDirectory = await getProjectDirectoryById(params);
	set.status = 200;
	return projectDirectory;
}

export async function deleteProjectDirectory({ params, set }) {
	const existingDirectory = await getProjectDirectoryById(params);
	if (!existingDirectory) {
		set.status = 404;
		return { error: ERRORS.PROJECT_DIRECTORY_NOT_FOUND };
	}

	const descendantIds = await getProjectDirectoryDescendantIds({ id: params.id });
	for (const directoryId of descendantIds) {
		await removeDirectoryOnVolume({
			project_id: existingDirectory.project_id,
			directory_id: directoryId,
		});
	}

	deleteProjectDirectoryById(params);
	set.status = 204;
	return;
}
