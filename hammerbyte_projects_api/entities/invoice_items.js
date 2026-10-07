import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createInvoiceLine({
	project_invoice_id,
	title,
	description = "",
	quantity = 1,
	unit_price = 0,
	created_by = null,
	updated_by = null,
}) {
	const invoiceLine = {
		project_invoice_id,
		title,
		description,
		quantity,
		unit_price,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO INVOICE_ITEMS ${sql(invoiceLine)}`,
	})
		.then((invoiceLineInserted) =>
			getInvoiceLineById({ id: Number(invoiceLineInserted.insertId) }),
		)
		.catch((error) => logger.error(`createInvoiceLine: ${error}`));
}

export async function getInvoiceLineById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM INVOICE_ITEMS WHERE id = ${id}`,
	})
		.then((invoiceLines) => {
			if (!invoiceLines.length) {
				return;
			}

			return invoiceLines[0];
		})
		.catch((error) => logger.error(`getInvoiceLineById: ${error}`));
}

export async function getInvoiceLinesByProjectInvoiceId({ project_invoice_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM INVOICE_ITEMS
				WHERE project_invoice_id = ${project_invoice_id}
				ORDER BY id ASC`,
	})
		.then((invoiceLines) => invoiceLines)
		.catch((error) => logger.error(`getInvoiceLinesByProjectInvoiceId: ${error}`));
}

export async function getAllInvoiceLines() {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM INVOICE_ITEMS ORDER BY project_invoice_id ASC, id ASC`,
	})
		.then((invoiceLines) => invoiceLines)
		.catch((error) => logger.error(`getAllInvoiceLines: ${error}`));
}

export async function updateInvoiceLineById({ id, ...invoiceLine }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`UPDATE INVOICE_ITEMS SET ${sql(invoiceLine)} WHERE id = ${id}`,
	})
		.then(() => getInvoiceLineById({ id }))
		.catch((error) => logger.error(`updateInvoiceLineById: ${error}`));
}

export async function deleteInvoiceLineById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM INVOICE_ITEMS WHERE id = ${id}`,
	})
		.then((invoiceLineDeleted) => invoiceLineDeleted)
		.catch((error) => logger.error(`deleteInvoiceLineById: ${error}`));
}

export async function deleteInvoiceLinesByProjectInvoiceId({ project_invoice_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`DELETE FROM INVOICE_ITEMS WHERE project_invoice_id = ${project_invoice_id}`,
	})
		.then((invoiceLinesDeleted) => invoiceLinesDeleted)
		.catch((error) => logger.error(`deleteInvoiceLinesByProjectInvoiceId: ${error}`));
}
