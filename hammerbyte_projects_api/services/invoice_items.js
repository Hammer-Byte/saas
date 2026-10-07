import { getProjectInvoiceById } from "../entities/project_invoices.js";
import {
	createInvoiceLine,
	deleteInvoiceLineById,
	getInvoiceLineById,
	updateInvoiceLineById,
} from "../entities/invoice_items.js";
import { ERRORS } from "../constants.js";

export async function addInvoiceLine({ body, user, set }) {
	const projectInvoice = await getProjectInvoiceById({
		id: body.project_invoice_id,
	});
	if (!projectInvoice) {
		set.status = 404;
		return { error: ERRORS.PROJECT_INVOICE_NOT_FOUND };
	}

	const invoiceLine = await createInvoiceLine({
		...body,
		title: body.title.trim(),
		description: body.description?.trim() || "",
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
	return invoiceLine;
}

export async function updateInvoiceLine({ params, body, user, set }) {
	const existingLine = await getInvoiceLineById(params);
	if (!existingLine) {
		set.status = 404;
		return { error: ERRORS.INVOICE_LINE_NOT_FOUND };
	}

	const lineUpdate = { updated_by: user.id };
	if (body.title) {
		lineUpdate.title = body.title.trim();
	}
	if (Object.hasOwn(body, "description")) {
		lineUpdate.description = body.description?.trim() || "";
	}
	if (Object.hasOwn(body, "quantity")) {
		lineUpdate.quantity = body.quantity;
	}
	if (Object.hasOwn(body, "unit_price")) {
		lineUpdate.unit_price = body.unit_price;
	}

	await updateInvoiceLineById({
		id: params.id,
		...lineUpdate,
	});

	const invoiceLine = await getInvoiceLineById(params);
	set.status = 200;
	return invoiceLine;
}

export async function deleteInvoiceLine({ params, set }) {
	const existingLine = await getInvoiceLineById(params);
	if (!existingLine) {
		set.status = 404;
		return { error: ERRORS.INVOICE_LINE_NOT_FOUND };
	}

	deleteInvoiceLineById(params);
	set.status = 204;
	return;
}
