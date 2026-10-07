/* eslint-disable lints/files -- Bun has no mkdir/rm/unlink; shell mkdir/rm also banned by lints/files */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { DOCUMENTS_VOLUME_PATH } from "../constants.js";

const { logger } = require("@hammerbyte/utils");

export function resolveProjectPath({ project_id }) {
	return join(DOCUMENTS_VOLUME_PATH, String(project_id));
}

export function resolveDirectoryPath({ project_id, directory_id }) {
	return join(resolveProjectPath({ project_id }), String(directory_id));
}

export function resolveDocumentPath({ project_id, directory_id, stored_name }) {
	return join(resolveDirectoryPath({ project_id, directory_id }), stored_name);
}

export async function createDirectoryOnVolume({ project_id, directory_id }) {
	const path = resolveDirectoryPath({ project_id, directory_id });
	try {
		await mkdir(path, { recursive: true });
		return path;
	} catch (error) {
		logger.error(`createDirectoryOnVolume: ${error}`);
		throw error;
	}
}

export async function removeDirectoryOnVolume({ project_id, directory_id }) {
	const path = resolveDirectoryPath({ project_id, directory_id });
	try {
		await rm(path, { recursive: true, force: true });
	} catch (error) {
		logger.error(`removeDirectoryOnVolume: ${error}`);
		throw error;
	}
}

export async function removeProjectOnVolume({ project_id }) {
	const path = resolveProjectPath({ project_id });
	try {
		await rm(path, { recursive: true, force: true });
	} catch (error) {
		logger.error(`removeProjectOnVolume: ${error}`);
		throw error;
	}
}

export async function writeDocumentOnVolume({
	project_id,
	directory_id,
	stored_name,
	data,
}) {
	const path = resolveDocumentPath({ project_id, directory_id, stored_name });
	try {
		await mkdir(resolveDirectoryPath({ project_id, directory_id }), {
			recursive: true,
		});
		await Bun.write(path, data);
		return path;
	} catch (error) {
		logger.error(`writeDocumentOnVolume: ${error}`);
		throw error;
	}
}

export async function removeDocumentOnVolume({
	project_id,
	directory_id,
	stored_name,
}) {
	const path = resolveDocumentPath({ project_id, directory_id, stored_name });
	try {
		const file = Bun.file(path);
		if (await file.exists()) {
			await rm(path, { force: true });
		}
	} catch (error) {
		logger.error(`removeDocumentOnVolume: ${error}`);
		throw error;
	}
}

export async function getDocumentFile({ project_id, directory_id, stored_name }) {
	const path = resolveDocumentPath({ project_id, directory_id, stored_name });
	const file = Bun.file(path);
	if (!(await file.exists())) {
		return;
	}
	return file;
}
