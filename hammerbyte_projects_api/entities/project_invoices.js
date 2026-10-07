import { executeSQLQuery, prepareSQLDateTime } from "../libs/db.js";
import {
	getAllInvoiceLines,
	getInvoiceLinesByProjectInvoiceId,
} from "./invoice_items.js";

const { logger } = require("@hammerbyte/utils");

export async function createProjectInvoice({
	project_id,
	title,
	notes = "",
	issued_at,
	due_at = null,
	active = true,
	created_by = null,
	updated_by = null,
}) {
	const projectInvoice = {
		project_id,
		title,
		notes,
		issued_at: prepareSQLDateTime({ value: issued_at }),
		due_at: due_at ? prepareSQLDateTime({ value: due_at }) : null,
		active: !!active,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO PROJECT_INVOICES ${sql(projectInvoice)}`,
	})
		.then((projectInvoiceInserted) =>
			getProjectInvoiceById({ id: Number(projectInvoiceInserted.insertId) }),
		)
		.catch((error) => logger.error(`createProjectInvoice: ${error}`));
}

export async function getProjectInvoiceById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM PROJECT_INVOICES WHERE id = ${id}`,
	})
		.then(async (projectInvoices) => {
			if (!projectInvoices.length) {
				return;
			}

			const projectInvoice = projectInvoices[0];
			projectInvoice.items = await getInvoiceLinesByProjectInvoiceId({
				project_invoice_id: projectInvoice.id,
			});
			return projectInvoice;
		})
		.catch((error) => logger.error(`getProjectInvoiceById: ${error}`));
}

export async function getProjectInvoicesByProjectId({ project_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM PROJECT_INVOICES
				WHERE project_id = ${project_id}
				ORDER BY id ASC`,
	})
		.then(async (projectInvoices) => {
			const invoiceLines = await getAllInvoiceLines();
			const linesByInvoiceId = new Map();

			for (const invoiceLine of invoiceLines || []) {
				if (!linesByInvoiceId.has(invoiceLine.project_invoice_id)) {
					linesByInvoiceId.set(invoiceLine.project_invoice_id, []);
				}
				linesByInvoiceId.get(invoiceLine.project_invoice_id).push(invoiceLine);
			}

			for (const projectInvoice of projectInvoices) {
				projectInvoice.items = linesByInvoiceId.get(projectInvoice.id) || [];
			}

			return projectInvoices;
		})
		.catch((error) => logger.error(`getProjectInvoicesByProjectId: ${error}`));
}

export async function updateProjectInvoiceById({ id, ...projectInvoice }) {
	if (Object.hasOwn(projectInvoice, "active")) {
		projectInvoice.active = !!projectInvoice.active;
	}

	if (projectInvoice.issued_at) {
		projectInvoice.issued_at = prepareSQLDateTime({
			value: projectInvoice.issued_at,
		});
	}

	if (Object.hasOwn(projectInvoice, "due_at")) {
		projectInvoice.due_at = projectInvoice.due_at
			? prepareSQLDateTime({ value: projectInvoice.due_at })
			: null;
	}

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`UPDATE PROJECT_INVOICES SET ${sql(projectInvoice)} WHERE id = ${id}`,
	})
		.then(() => getProjectInvoiceById({ id }))
		.catch((error) => logger.error(`updateProjectInvoiceById: ${error}`));
}

export async function deleteProjectInvoiceById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM PROJECT_INVOICES WHERE id = ${id}`,
	})
		.then((projectInvoiceDeleted) => projectInvoiceDeleted)
		.catch((error) => logger.error(`deleteProjectInvoiceById: ${error}`));
}
