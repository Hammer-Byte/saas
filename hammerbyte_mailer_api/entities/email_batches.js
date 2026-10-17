import { executeSQLQuery } from "../libs/db.js";
import { getAllEmails, getEmailsByBatchId } from "./emails.js";

const { logger } = require("@hammerbyte/utils");

export async function createEmailBatch({ interval, active = true, created_by = null, updated_by = null }) {
	const emailBatch = {
		interval,
		active: !!active,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO EMAIL_BATCHES ${sql(emailBatch)}`,
	})
		.then((emailBatchInserted) =>
			getEmailBatchById({ id: Number(emailBatchInserted.insertId) }),
		)
		.catch((error) => logger.error(`createEmailBatch: ${error}`));
}

export async function getEmailBatchById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_BATCHES WHERE id = ${id}`,
	})
		.then(async (emailBatches) => {
			if (!emailBatches.length) {
				return;
			}

			const emailBatch = emailBatches[0];
			emailBatch.emails = await getEmailsByBatchId({ batch_id: emailBatch.id });
			return emailBatch;
		})
		.catch((error) => logger.error(`getEmailBatchById: ${error}`));
}

export async function getAllEmailBatches() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_BATCHES ORDER BY id DESC`,
	})
		.then(async (emailBatches) => {
			const emails = await getAllEmails();
			const emailsByBatchId = new Map();

			for (const email of emails || []) {
				if (!emailsByBatchId.has(email.batch_id)) {
					emailsByBatchId.set(email.batch_id, []);
				}
				emailsByBatchId.get(email.batch_id).push(email);
			}

			for (const emailBatch of emailBatches) {
				emailBatch.emails = emailsByBatchId.get(emailBatch.id) || [];
			}

			return emailBatches;
		})
		.catch((error) => logger.error(`getAllEmailBatches: ${error}`));
}

export async function updateEmailBatchById({ id, ...emailBatch }) {
	if (Object.hasOwn(emailBatch, "active")) {
		emailBatch.active = !!emailBatch.active;
	}

	await executeSQLQuery({
		queryFunction: (sql) =>
			sql`UPDATE EMAIL_BATCHES SET ${sql(emailBatch)} WHERE id = ${id}`,
	}).catch((error) => logger.error(`updateEmailBatchById: ${error}`));
}

export async function deleteEmailBatchById({ id }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM EMAIL_BATCHES WHERE id = ${id}`,
	}).catch((error) => logger.error(`deleteEmailBatchById: ${error}`));
}
