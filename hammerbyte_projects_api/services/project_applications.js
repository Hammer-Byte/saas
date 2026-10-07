import { getProjectById } from "../entities/projects.js";
import {
	createProjectApplication,
	deleteProjectApplicationById,
	getProjectApplicationById,
	getProjectApplicationsByProjectId,
	updateProjectApplicationById,
} from "../entities/project_applications.js";
import { ERRORS } from "../constants.js";

export async function getProjectApplications({ params, set }) {
	const project = await getProjectById({ id: params.id });
	if (!project) {
		set.status = 404;
		return { error: ERRORS.PROJECT_NOT_FOUND };
	}

	const projectApplications = await getProjectApplicationsByProjectId({
		project_id: params.id,
	});
	set.status = 200;
	return projectApplications;
}

export async function getProjectApplication({ params, set }) {
	const projectApplication = await getProjectApplicationById(params);
	if (!projectApplication) {
		set.status = 404;
		return { error: ERRORS.PROJECT_APPLICATION_NOT_FOUND };
	}
	set.status = 200;
	return projectApplication;
}

export async function addProjectApplication({ params, body, user, set }) {
	const project = await getProjectById({ id: params.id });
	if (!project) {
		set.status = 404;
		return { error: ERRORS.PROJECT_NOT_FOUND };
	}

	const projectApplication = await createProjectApplication({
		...body,
		project_id: params.id,
		title: body.title.trim(),
		description: body.description?.trim() || "",
		url: body.url?.trim() || "",
		active: Object.hasOwn(body, "active") ? body.active : true,
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
	return projectApplication;
}

export async function updateProjectApplication({ params, body, user, set }) {
	const existingApplication = await getProjectApplicationById(params);
	if (!existingApplication) {
		set.status = 404;
		return { error: ERRORS.PROJECT_APPLICATION_NOT_FOUND };
	}

	const applicationUpdate = { updated_by: user.id };
	if (body.title) {
		applicationUpdate.title = body.title.trim();
	}
	if (Object.hasOwn(body, "description")) {
		applicationUpdate.description = body.description?.trim() || "";
	}
	if (Object.hasOwn(body, "url")) {
		applicationUpdate.url = body.url?.trim() || "";
	}
	if (Object.hasOwn(body, "active")) {
		applicationUpdate.active = body.active;
	}

	await updateProjectApplicationById({
		id: params.id,
		...applicationUpdate,
	});

	const projectApplication = await getProjectApplicationById(params);
	set.status = 200;
	return projectApplication;
}

export async function deleteProjectApplication({ params, set }) {
	const existingApplication = await getProjectApplicationById(params);
	if (!existingApplication) {
		set.status = 404;
		return { error: ERRORS.PROJECT_APPLICATION_NOT_FOUND };
	}

	deleteProjectApplicationById(params);
	set.status = 204;
	return;
}
