import { t } from "elysia";
import {
	addInvoiceLine,
	deleteInvoiceLine,
	updateInvoiceLine,
} from "../../services/invoice_items.js";
import { ERRORS } from "../../constants.js";

const invoiceLineIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function invoiceItems(app) {
	return app
		.post("/", addInvoiceLine, {
			body: t.Object({
				project_invoice_id: t.Number({
					minimum: 1,
					error: ERRORS.VALIDATION.PROJECT_INVOICE_ID_REQUIRED,
				}),
				title: t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				description: t.Optional(
					t.String({ error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED }),
				),
				quantity: t.Number({ error: ERRORS.VALIDATION.QUANTITY_REQUIRED }),
				unit_price: t.Number({ error: ERRORS.VALIDATION.UNIT_PRICE_REQUIRED }),
			}),
			detail: {
				tags: ["Invoice Items"],
				summary: "Create invoice line",
				description: "Adds a line to an invoice.",
			},
		})
		.patch("/:id", updateInvoiceLine, {
			params: invoiceLineIdParams,
			body: t.Object({
				title: t.Optional(
					t.String({ minLength: 1, error: ERRORS.VALIDATION.TITLE_REQUIRED }),
				),
				description: t.Optional(
					t.String({ error: ERRORS.VALIDATION.DESCRIPTION_REQUIRED }),
				),
				quantity: t.Optional(
					t.Number({ error: ERRORS.VALIDATION.QUANTITY_REQUIRED }),
				),
				unit_price: t.Optional(
					t.Number({ error: ERRORS.VALIDATION.UNIT_PRICE_REQUIRED }),
				),
			}),
			detail: {
				tags: ["Invoice Items"],
				summary: "Update invoice line",
				description: "Updates an invoice line.",
			},
		})
		.delete("/:id", deleteInvoiceLine, {
			params: invoiceLineIdParams,
			detail: {
				tags: ["Invoice Items"],
				summary: "Delete invoice line",
				description: "Deletes an invoice line by id.",
			},
		});
}
