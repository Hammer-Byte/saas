import { t } from "elysia";
import {
	deleteProjectInvoice,
	getProjectInvoice,
	updateProjectInvoice,
} from "../../services/project_invoices.js";
import { ERRORS } from "../../constants.js";

const invoiceIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function projectInvoices(app) {
	return app
		.get("/:id", getProjectInvoice, {
			params: invoiceIdParams,
			detail: {
				tags: ["Project Invoices"],
				summary: "Get invoice",
				description: "Returns a single invoice with items and computed total.",
			},
		})
		.patch("/:id", updateProjectInvoice, {
			params: invoiceIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
				notes: t.Optional(t.String({ error: ERRORS.VALIDATION.NOTES_REQUIRED })),
				issued_at: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.ISSUED_AT_REQUIRED }),
				),
				due_at: t.Optional(
					t.String({ error: ERRORS.VALIDATION.DUE_AT_REQUIRED }),
				),
				active: t.Optional(t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED })),
				items: t.Optional(
					t.Array(
						t.Object({
							title: t.String({
								minLength: 1,
								error: ERRORS.VALIDATION.TITLE_REQUIRED,
							}),
							description: t.Optional(
								t.String({ error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED }),
							),
							quantity: t.Number({ error: ERRORS.VALIDATION.QUANTITY_REQUIRED }),
							unit_price: t.Number({
								error: ERRORS.VALIDATION.UNIT_PRICE_REQUIRED,
							}),
						}),
						{ error: ERRORS.VALIDATION.ITEMS_INVALID },
					),
				),
			}),
			detail: {
				tags: ["Project Invoices"],
				summary: "Update invoice",
				description:
					"Updates invoice fields. When items is provided, it replaces the set.",
			},
		})
		.delete("/:id", deleteProjectInvoice, {
			params: invoiceIdParams,
			detail: {
				tags: ["Project Invoices"],
				summary: "Delete invoice",
				description: "Deletes an invoice and its items.",
			},
		});
}
