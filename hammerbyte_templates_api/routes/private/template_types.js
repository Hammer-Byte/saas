import { t } from "elysia";
import { addTemplateType, deleteTemplateType, getTemplateType, getTemplateTypes, populateAuditAttributes, updateTemplateType } from "../../services/template_types.js";
import { ERRORS } from "../../constants.js";

const templateTypeIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function templateTypes(app) {
	return app
		.get("/", getTemplateTypes, {
			detail: {
				tags: ["Template Types"],
				summary: "List template types",
				description: "Returns all template types.",
			},
		})
		.get("/:id", getTemplateType, {
			params: templateTypeIdParams,
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
				tags: ["Template Types"],
				summary: "Get template type",
				description: "Returns a single template type by id.",
			},
		})
		.post("/", addTemplateType, {
			body: t.Object({
				name: t.String({ minLength: 1, error: ERRORS.VALIDATION.NAME_REQUIRED }),
			}),
			detail: {
				tags: ["Template Types"],
				summary: "Create template type",
				description: "Creates a template type with a unique name.",
			},
		})
		.patch("/:id", updateTemplateType, {
			params: templateTypeIdParams,
			body: t.Object({
				name: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.NAME_REQUIRED }),
				),
			}),
			detail: {
				tags: ["Template Types"],
				summary: "Update template type",
				description: "Updates the name of an existing template type.",
			},
		})
		.delete("/:id", deleteTemplateType, {
			params: templateTypeIdParams,
			detail: {
				tags: ["Template Types"],
				summary: "Delete template type",
				description:
					"Deletes a template type. Fails if any templates reference it.",
			},
		});
}
