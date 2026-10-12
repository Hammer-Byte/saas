import { t } from "elysia";
import { addMedia, deleteMedia, getMedia, updateMediaPrivate } from "../../services/media.js";
import { ERRORS } from "../../constants.js";

const mediaIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function media(app) {
	return app
		.post("/", addMedia, {
			type: "multipart/form-data",
			body: t.Object({
				name: t.String({ minLength: 1, error: ERRORS.VALIDATION.NAME_REQUIRED }),
				binary: t.File({ error: ERRORS.VALIDATION.BINARY_REQUIRED }),
			}),
			detail: {
				tags: ["Media"],
				summary: "Upload media",
				description:
					"Multipart upload: name + binary. Persists name and stores binary under a unix-timestamp filename on the media volume.",
			},
		})
		.get("/:id", getMedia, {
			params: mediaIdParams,
			detail: {
				tags: ["Media"],
				summary: "Read media",
				description: "Returns the binary file for a media id.",
			},
		})
		.delete("/:id", deleteMedia, {
			params: mediaIdParams,
			detail: {
				tags: ["Media"],
				summary: "Delete media",
				description: "Deletes the file on volume and the media row.",
			},
		})
		.patch("/:id/private", updateMediaPrivate, {
			params: mediaIdParams,
			body: t.Object({
				private: t.Boolean({ error: ERRORS.VALIDATION.PRIVATE_REQUIRED }),
			}),
			detail: {
				tags: ["Media"],
				summary: "Update media private flag",
				description: "Sets private true/false on a media row.",
			},
		});
}
