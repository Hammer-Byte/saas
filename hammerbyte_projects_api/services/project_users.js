import { getProjectById } from "../entities/projects.js";
import {
	createProjectUser,
	deleteProjectUserById,
	getProjectUserById,
	getProjectUserByProjectIdAndUserId,
	getProjectUsersByProjectId,
	updateProjectUserById,
} from "../entities/project_users.js";
import { ERRORS } from "../constants.js";

export async function getProjectUsers({ params, set }) {
	const project = await getProjectById({ id: params.id });
	if (!project) {
		set.status = 404;
		return { error: ERRORS.PROJECT_NOT_FOUND };
	}

	const projectUsers = await getProjectUsersByProjectId({
		project_id: params.id,
	});
	set.status = 200;
	return projectUsers;
}

export async function addProjectUser({ params, body, user, set }) {
	const project = await getProjectById({ id: params.id });
	if (!project) {
		set.status = 404;
		return { error: ERRORS.PROJECT_NOT_FOUND };
	}

	const existingMembership = await getProjectUserByProjectIdAndUserId({
		project_id: params.id,
		user_id: body.user_id,
	});
	if (existingMembership) {
		set.status = 200;
		return existingMembership;
	}

	const projectUser = await createProjectUser({
		...body,
		project_id: params.id,
		active: Object.hasOwn(body, "active") ? body.active : true,
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
	return projectUser;
}

export async function updateProjectUser({ params, body, user, set }) {
	const existingProjectUser = await getProjectUserById(params);
	if (!existingProjectUser) {
		set.status = 404;
		return { error: ERRORS.PROJECT_USER_NOT_FOUND };
	}

	const projectUserUpdate = { updated_by: user.id };
	if (Object.hasOwn(body, "active")) {
		projectUserUpdate.active = body.active;
	}

	await updateProjectUserById({
		id: params.id,
		...projectUserUpdate,
	});

	const projectUser = await getProjectUserById(params);
	set.status = 200;
	return projectUser;
}

export async function deleteProjectUser({ params, set }) {
	const existingProjectUser = await getProjectUserById(params);
	if (!existingProjectUser) {
		set.status = 404;
		return { error: ERRORS.PROJECT_USER_NOT_FOUND };
	}

	deleteProjectUserById(params);
	set.status = 204;
	return;
}
