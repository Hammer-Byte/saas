/* eslint-disable lints/files -- Bun has no unlink; volume ops need node:fs/promises */
import { unlink } from "node:fs/promises";

const { logger } = require("@hammerbyte/utils");

export async function readFile({ file }) {
	try {
		const binary = Bun.file(file);
		if (!(await binary.exists())) {
			return;
		}
		return binary;
	} catch (error) {
		logger.error(`readFile: ${error}`);
	}
}

export async function writeFile({ file, binary }) {
	try {
		await Bun.write(file, binary);
	} catch (error) {
		logger.error(`writeFile: ${error}`);
	}
}

export async function deleteFile({ file }) {
	if (!file) {
		return;
	}
	try {
		await unlink(file);
	} catch (error) {
		logger.error(`deleteFile: ${error}`);
	}
}
