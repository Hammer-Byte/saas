import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createEmailCc({ email_id, cc, created_by = null, updated_by = null }) {
	const emailCc = { email_id, cc, created_by, updated_by };

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO EMAIL_CCS ${sql(emailCc)}`,
	})
		.then((emailCcInserted) => getEmailCcById({ id: Number(emailCcInserted.insertId) }))
		.catch((error) => logger.error(`createEmailCc: ${error}`));
}

export async function getEmailCcById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_CCS WHERE id = ${id}`,
	})
		.then((emailCcs) => emailCcs[0])
		.catch((error) => logger.error(`getEmailCcById: ${error}`));
}

export async function getEmailCcsByEmailId({ email_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM EMAIL_CCS WHERE email_id = ${email_id} ORDER BY id ASC`,
	}).catch((error) => logger.error(`getEmailCcsByEmailId: ${error}`));
}

export async function getAllEmailCcs() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_CCS ORDER BY id ASC`,
	}).catch((error) => logger.error(`getAllEmailCcs: ${error}`));
}
