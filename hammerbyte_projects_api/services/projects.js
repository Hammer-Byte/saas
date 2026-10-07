import {
	createProject,
	deleteProjectById,
	getAllProjects,
	getProjectById,
	getProjectsByUserId,
	updateProjectById,
} from "../entities/projects.js";
import { createProjectUser } from "../entities/project_users.js";
import { removeProjectOnVolume } from "../libs/documents_volume.js";
import { ERRORS } from "../constants.js";

export async function getProjects({ query, user, set }) {
	const projects = query.mine
		? await getProjectsByUserId({ user_id: user.id })
		: await getAllProjects();
	set.status = 200;
	return projects;
}

export async function getProject({ params, set }) {
	const project = await getProjectById(params);
	if (!project) {
		set.status = 404;
		return { error: ERRORS.PROJECT_NOT_FOUND };
	}
	set.status = 200;
	return project;
}

export async function addProject({ body, user, set }) {
	const project = await createProject({
		title: body.title.trim(),
		description: body.description?.trim() || "",
		active: Object.hasOwn(body, "active") ? body.active : true,
		created_by: user.id,
		updated_by: user.id,
	});

	await createProjectUser({
		project_id: project.id,
		user_id: user.id,
		active: true,
		created_by: user.id,
		updated_by: user.id,
	});

	const createdProject = await getProjectById({ id: project.id });
	set.status = 201;
	return createdProject;
}

export async function updateProject({ params, body, user, set }) {
	const existingProject = await getProjectById(params);
	if (!existingProject) {
		set.status = 404;
		return { error: ERRORS.PROJECT_NOT_FOUND };
	}

	const projectUpdate = { updated_by: user.id };
	if (body.title) {
		projectUpdate.title = body.title.trim();
	}
	if (Object.hasOwn(body, "description")) {
		projectUpdate.description = body.description?.trim() || "";
	}
	if (Object.hasOwn(body, "active")) {
		projectUpdate.active = body.active;
	}

	await updateProjectById({
		id: params.id,
		...projectUpdate,
	});

	const project = await getProjectById(params);
	set.status = 200;
	return project;
}

export async function deleteProject({ params, set }) {
	const existingProject = await getProjectById(params);
	if (!existingProject) {
		set.status = 404;
		return { error: ERRORS.PROJECT_NOT_FOUND };
	}

	await removeProjectOnVolume({ project_id: params.id });
	deleteProjectById(params);
	set.status = 204;
	return;
}
