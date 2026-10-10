import { t } from "elysia";
import { addTemplate, deleteTemplate, getTemplate, getTemplates, updateTemplate } from "../../services/templates.js";
import { addPlaceHolder, deletePlaceHolder, getPlaceHolders, updatePlaceHolder } from "../../services/template_place_holders.js";
import { ERRORS } from "../../constants.js";

const templateIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

const placeholderIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
	placeholderId: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

const placeHolderBody = t.Object({
	place_holder: t.String({
		minLength: 1,
		error: ERRORS.VALIDATION.PLACE_HOLDER_REQUIRED,
	}),
});

export default function templates(app) {
	return app
		.get("/", getTemplates, {
			detail: {
				tags: ["Templates"],
				summary: "List templates",
				description: "Returns all email templates including placeholders.",
			},
		})
		.get("/:id", getTemplate, {
			params: templateIdParams,
			detail: {
				tags: ["Templates"],
				summary: "Get template",
				description: "Returns a single template by id, including placeholders.",
			},
		})
		.post("/", addTemplate, {
			type: "multipart/form-data",
			body: t.Object({
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				file: t.File({ error: ERRORS.VALIDATION.FILE_REQUIRED }),
			}),
			detail: {
				tags: ["Templates"],
				summary: "Create template",
				description:
					"Creates a template from an uploaded HTML file stored under STORAGE_PATH/templates.",
			},
		})
		.patch("/:id", updateTemplate, {
			type: "multipart/form-data",
			params: templateIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
				file: t.Optional(t.File({ error: ERRORS.VALIDATION.FILE_REQUIRED })),
			}),
			detail: {
				tags: ["Templates"],
				summary: "Update template",
				description: "Updates title and/or replaces the HTML file on the volume.",
			},
		})
		.delete("/:id", deleteTemplate, {
			params: templateIdParams,
			detail: {
				tags: ["Templates"],
				summary: "Delete template",
				description:
					"Deletes the template, cascaded placeholders, and the HTML file. Fails if batches reference it.",
			},
		})
		.get("/:id/placeholders", getPlaceHolders, {
			params: templateIdParams,
			detail: {
				tags: ["Template Placeholders"],
				summary: "List placeholders",
				description: "Returns placeholders for a template.",
			},
		})
		.post("/:id/placeholders", addPlaceHolder, {
			params: templateIdParams,
			body: placeHolderBody,
			detail: {
				tags: ["Template Placeholders"],
				summary: "Create placeholder",
				description: "Adds a placeholder key for the template.",
			},
		})
		.patch("/:id/placeholders/:placeholderId", updatePlaceHolder, {
			params: placeholderIdParams,
			body: placeHolderBody,
			detail: {
				tags: ["Template Placeholders"],
				summary: "Update placeholder",
				description: "Renames a placeholder key.",
			},
		})
		.delete("/:id/placeholders/:placeholderId", deletePlaceHolder, {
			params: placeholderIdParams,
			detail: {
				tags: ["Template Placeholders"],
				summary: "Delete placeholder",
				description: "Removes a placeholder key from the template.",
			},
		});
}
