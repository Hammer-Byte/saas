import { t } from "elysia";
import { addTemplate, deleteTemplate, getInjected, getTemplate, getTemplates, populateAuditAttributes, updateTemplate } from "../../services/templates.js";
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
			query: t.Object({
				service_id: t.Number({
					minimum: 1,
					error: ERRORS.VALIDATION.SERVICE_ID_REQUIRED,
				}),
			}),
			detail: {
				tags: ["Templates"],
				summary: "List templates",
				description: "Returns templates for a service_id, including placeholders.",
			},
		})
		.get("/:id", getTemplate, {
			params: templateIdParams,
			afterHandle: async ({ response, authentication_token }) => {
				if (!response?.id) {
					return;
				}
				return populateAuditAttributes({
					entity: response,
					authentication_token,
				});
			},
			detail: {
				tags: ["Templates"],
				summary: "Get template",
				description: "Returns a single template by id, including placeholders.",
			},
		})
		.post("/:id/injected", getInjected, {
			params: templateIdParams,
			body: t.Object({
				injects: t.Record(t.String(), t.Any(), {
					error: ERRORS.VALIDATION.INJECTS_REQUIRED,
				}),
			}),
			detail: {
				tags: ["Templates"],
				summary: "Inject template placeholders",
				description:
					"Fetches the template HTML from media, substitutes injects for registered placeholders, and returns the prepared content.",
			},
		})
		.post("/", addTemplate, {
			body: t.Object({
				service_id: t.Number({
					minimum: 1,
					error: ERRORS.VALIDATION.SERVICE_ID_REQUIRED,
				}),
				type_id: t.Number({
					minimum: 1,
					error: ERRORS.VALIDATION.TYPE_ID_REQUIRED,
				}),
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				media_id: t.Number({
					minimum: 1,
					error: ERRORS.VALIDATION.MEDIA_ID_REQUIRED,
				}),
			}),
			detail: {
				tags: ["Templates"],
				summary: "Create template",
				description:
					"Creates a template for a service with a type and media file reference.",
			},
		})
		.patch("/:id", updateTemplate, {
			params: templateIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
				type_id: t.Optional(
					t.Number({ minimum: 1, error: ERRORS.VALIDATION.TYPE_ID_REQUIRED }),
				),
				media_id: t.Optional(
					t.Number({ minimum: 1, error: ERRORS.VALIDATION.MEDIA_ID_REQUIRED }),
				),
			}),
			detail: {
				tags: ["Templates"],
				summary: "Update template",
				description: "Updates title, type_id, and/or media_id on a template.",
			},
		})
		.delete("/:id", deleteTemplate, {
			params: templateIdParams,
			detail: {
				tags: ["Templates"],
				summary: "Delete template",
				description: "Deletes the template and cascaded placeholders.",
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
