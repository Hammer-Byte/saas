import { join } from "node:path";

import { createMedia, deleteMediaById, getMediaById, updateMediaById } from "../entities/media.js";
import { deleteFile, readFile, writeFile } from "../libs/storage.js";
import { ERRORS, STORAGE_DIRS, STORAGE_PATH } from "../constants.js";

export async function addMedia({ body, user, set }) {
	const name = String(body.name).trim();
	const file = join(STORAGE_PATH, STORAGE_DIRS.MEDIA, String(Date.now()));

	await writeFile({ file, data: body.data });

	const media = await createMedia({
		name,
		file,
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
	return media;
}

export async function getMedia({ params, set }) {
	const media = await getMediaById(params);
	if (!media) {
		set.status = 404;
		return { error: ERRORS.MEDIA_NOT_FOUND };
	}

	const data = await readFile({ file: media.file });
	if (!data) {
		set.status = 404;
		return { error: ERRORS.MEDIA_FILE_NOT_FOUND };
	}

	set.status = 200;
	set.headers["Content-Type"] = data.type || "application/octet-stream";
	set.headers["Content-Disposition"] =
		`attachment; filename="${String(media.name).replace(/"/g, "")}"`;
	return data;
}

export async function deleteMedia({ params, set }) {
	const media = await getMediaById(params);
	if (!media) {
		set.status = 404;
		return { error: ERRORS.MEDIA_NOT_FOUND };
	}

	await deleteFile({ file: media.file });
	deleteMediaById({ id: params.id });
	set.status = 204;
}

export async function updateMediaPrivate({ params, body, user, set }) {
	const media = await getMediaById(params);
	if (!media) {
		set.status = 404;
		return { error: ERRORS.MEDIA_NOT_FOUND };
	}

	await updateMediaById({
		id: params.id,
		private: body.private,
		updated_by: user.id,
	});

	const updatedMedia = await getMediaById(params);
	set.status = 200;
	return updatedMedia;
}
