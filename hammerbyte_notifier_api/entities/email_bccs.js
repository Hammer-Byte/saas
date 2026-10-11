import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createEmailBcc({ email_id, bcc, created_by = null, updated_by = null }) {
	const emailBcc = { email_id, bcc, created_by, updated_by };

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO EMAIL_BCCS ${sql(emailBcc)}`,
	})
		.then((emailBccInserted) =>
			getEmailBccById({ id: Number(emailBccInserted.insertId) }),
		)
		.catch((error) => logger.error(`createEmailBcc: ${error}`));
}

export async function getEmailBccById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_BCCS WHERE id = ${id}`,
	})
		.then((emailBccs) => emailBccs[0])
		.catch((error) => logger.error(`getEmailBccById: ${error}`));
}

export async function getEmailBccsByEmailId({ email_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM EMAIL_BCCS WHERE email_id = ${email_id} ORDER BY id ASC`,
	}).catch((error) => logger.error(`getEmailBccsByEmailId: ${error}`));
}

export async function getAllEmailBccs() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_BCCS ORDER BY id ASC`,
	}).catch((error) => logger.error(`getAllEmailBccs: ${error}`));
}
