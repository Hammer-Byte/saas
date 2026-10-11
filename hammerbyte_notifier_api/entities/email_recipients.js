import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createEmailRecipient({
	email_id,
	recipient,
	created_by = null,
	updated_by = null,
}) {
	const emailRecipient = { email_id, recipient, created_by, updated_by };

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO EMAIL_RECIPIENTS ${sql(emailRecipient)}`,
	})
		.then((emailRecipientInserted) =>
			getEmailRecipientById({ id: Number(emailRecipientInserted.insertId) }),
		)
		.catch((error) => logger.error(`createEmailRecipient: ${error}`));
}

export async function getEmailRecipientById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_RECIPIENTS WHERE id = ${id}`,
	})
		.then((emailRecipients) => emailRecipients[0])
		.catch((error) => logger.error(`getEmailRecipientById: ${error}`));
}

export async function getEmailRecipientsByEmailId({ email_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM EMAIL_RECIPIENTS WHERE email_id = ${email_id} ORDER BY id ASC`,
	}).catch((error) => logger.error(`getEmailRecipientsByEmailId: ${error}`));
}

export async function getAllEmailRecipients() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_RECIPIENTS ORDER BY id ASC`,
	}).catch((error) => logger.error(`getAllEmailRecipients: ${error}`));
}
