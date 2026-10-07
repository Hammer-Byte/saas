import { getProjectById } from "../entities/projects.js";
import {
	createProjectInvoice,
	deleteProjectInvoiceById,
	getProjectInvoiceById,
	getProjectInvoicesByProjectId,
	updateProjectInvoiceById,
} from "../entities/project_invoices.js";
import {
	createInvoiceLine,
	deleteInvoiceLinesByProjectInvoiceId,
} from "../entities/invoice_items.js";
import { ERRORS } from "../constants.js";
import { computeInvoiceTotal } from "../util.js";

function withInvoiceTotal({ projectInvoice }) {
	return {
		...projectInvoice,
		total: computeInvoiceTotal({ items: projectInvoice.items }),
	};
}

export async function getProjectInvoices({ params, set }) {
	const project = await getProjectById({ id: params.id });
	if (!project) {
		set.status = 404;
		return { error: ERRORS.PROJECT_NOT_FOUND };
	}

	const projectInvoices = await getProjectInvoicesByProjectId({
		project_id: params.id,
	});
	set.status = 200;
	return projectInvoices.map((projectInvoice) =>
		withInvoiceTotal({ projectInvoice }),
	);
}

export async function getProjectInvoice({ params, set }) {
	const projectInvoice = await getProjectInvoiceById(params);
	if (!projectInvoice) {
		set.status = 404;
		return { error: ERRORS.PROJECT_INVOICE_NOT_FOUND };
	}
	set.status = 200;
	return withInvoiceTotal({ projectInvoice });
}

export async function addProjectInvoice({ params, body, user, set }) {
	const project = await getProjectById({ id: params.id });
	if (!project) {
		set.status = 404;
		return { error: ERRORS.PROJECT_NOT_FOUND };
	}

	const { items, ...invoiceFields } = body;

	const projectInvoice = await createProjectInvoice({
		...invoiceFields,
		project_id: params.id,
		title: body.title.trim(),
		notes: body.notes?.trim() || "",
		due_at: body.due_at || null,
		active: Object.hasOwn(body, "active") ? body.active : true,
		created_by: user.id,
		updated_by: user.id,
	});

	if (items?.length) {
		for (const invoiceLine of items) {
			await createInvoiceLine({
				...invoiceLine,
				project_invoice_id: projectInvoice.id,
				title: invoiceLine.title.trim(),
				description: invoiceLine.description?.trim() || "",
				created_by: user.id,
				updated_by: user.id,
			});
		}
	}

	const createdInvoice = await getProjectInvoiceById({ id: projectInvoice.id });
	set.status = 201;
	return withInvoiceTotal({ projectInvoice: createdInvoice });
}

export async function updateProjectInvoice({ params, body, user, set }) {
	const existingInvoice = await getProjectInvoiceById(params);
	if (!existingInvoice) {
		set.status = 404;
		return { error: ERRORS.PROJECT_INVOICE_NOT_FOUND };
	}

	const { items, ...invoiceFields } = body;

	const invoiceUpdate = { updated_by: user.id };
	if (invoiceFields.title) {
		invoiceUpdate.title = invoiceFields.title.trim();
	}
	if (Object.hasOwn(invoiceFields, "notes")) {
		invoiceUpdate.notes = invoiceFields.notes?.trim() || "";
	}
	if (invoiceFields.issued_at) {
		invoiceUpdate.issued_at = invoiceFields.issued_at;
	}
	if (Object.hasOwn(invoiceFields, "due_at")) {
		invoiceUpdate.due_at = invoiceFields.due_at || null;
	}
	if (Object.hasOwn(invoiceFields, "active")) {
		invoiceUpdate.active = invoiceFields.active;
	}

	await updateProjectInvoiceById({
		id: params.id,
		...invoiceUpdate,
	});

	if (Object.hasOwn(body, "items")) {
		await deleteInvoiceLinesByProjectInvoiceId({ project_invoice_id: params.id });
		for (const invoiceLine of items || []) {
			await createInvoiceLine({
				...invoiceLine,
				project_invoice_id: params.id,
				title: invoiceLine.title.trim(),
				description: invoiceLine.description?.trim() || "",
				created_by: user.id,
				updated_by: user.id,
			});
		}
	}

	const projectInvoice = await getProjectInvoiceById(params);
	set.status = 200;
	return withInvoiceTotal({ projectInvoice });
}

export async function deleteProjectInvoice({ params, set }) {
	const existingInvoice = await getProjectInvoiceById(params);
	if (!existingInvoice) {
		set.status = 404;
		return { error: ERRORS.PROJECT_INVOICE_NOT_FOUND };
	}

	deleteProjectInvoiceById(params);
	set.status = 204;
	return;
}
