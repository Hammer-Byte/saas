import { t } from "elysia";
import { addEntitiesBatchAudit, addEntityAudit } from "../../services/entity_audit.js";
import { ERRORS } from "../../constants.js";

export default function entityAudits(app) {
	return app
		.patch("/", addEntityAudit, {
			body: t.Object(
				{
					created_by: t.Number({ minimum: 1, error: ERRORS.VALIDATION.CREATED_BY_REQUIRED }),
					updated_by: t.Number({ minimum: 1, error: ERRORS.VALIDATION.UPDATED_BY_REQUIRED }),
				},
				{ additionalProperties: true },
			),
			detail: {
				tags: ["Entity Audit"],
				summary: "Populate entity audit attributes",
				description:
					"Accepts one entity object. Resolves created_by and updated_by user ids to user objects when present.",
			},
		})
		.patch("/batch", addEntitiesBatchAudit, {
			body: t.Array(
				t.Object(
					{
						created_by: t.Number({
							minimum: 1,
							error: ERRORS.VALIDATION.CREATED_BY_REQUIRED,
						}),
						updated_by: t.Number({
							minimum: 1,
							error: ERRORS.VALIDATION.UPDATED_BY_REQUIRED,
						}),
					},
					{ additionalProperties: true },
				),
			),
			detail: {
				tags: ["Entity Audit"],
				summary: "Populate entities audit attributes",
				description:
					"Accepts a list of entity objects. Resolves created_by and updated_by user ids to user objects.",
			},
		});
}
