/* eslint-disable lints/files -- Bun has no unlink; volume ops need node:fs/promises */
import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { STORAGE_DIRS, STORAGE_PATH } from "../constants.js";
import { getFileExtension } from "../util.js";

const { logger } = require("@hammerbyte/utils");

export function getTemplatesDir() {
	return join(STORAGE_PATH, STORAGE_DIRS.TEMPLATES);
}

export function getAttachmentsDir() {
	return join(STORAGE_PATH, STORAGE_DIRS.ATTACHMENTS);
}

export async function writeTemplateFile({ data, extension = "html" }) {
	const storedName = `${Date.now()}.${extension}`;
	const path = join(getTemplatesDir(), storedName);
	try {
		await Bun.write(path, data);
		return path;
	} catch (error) {
		logger.error(`writeTemplateFile: ${error}`);
		throw error;
	}
}

export async function writeAttachmentFile({ data, originalName }) {
	const extension = getFileExtension({ name: originalName });
	const storedName = `${Date.now()}.${extension}`;
	const path = join(getAttachmentsDir(), storedName);
	try {
		await Bun.write(path, data);
		return path;
	} catch (error) {
		logger.error(`writeAttachmentFile: ${error}`);
		throw error;
	}
}

export async function removeStorageFile({ path }) {
	if (!path) {
		return;
	}
	try {
		await unlink(path);
	} catch (error) {
		if (error?.code !== "ENOENT") {
			logger.error(`removeStorageFile: ${error}`);
		}
	}
}
