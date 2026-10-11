import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

export async function createEmailAttachment({
	email_id,
	file,
	name,
	created_by = null,
	updated_by = null,
}) {
	const emailAttachment = { email_id, file, name, created_by, updated_by };

	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`INSERT INTO EMAIL_ATTACHMENTS ${sql(emailAttachment)}`,
	})
		.then((emailAttachmentInserted) =>
			getEmailAttachmentById({ id: Number(emailAttachmentInserted.insertId) }),
		)
		.catch((error) => logger.error(`createEmailAttachment: ${error}`));
}

export async function getEmailAttachmentById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_ATTACHMENTS WHERE id = ${id}`,
	})
		.then((emailAttachments) => emailAttachments[0])
		.catch((error) => logger.error(`getEmailAttachmentById: ${error}`));
}

export async function getEmailAttachmentsByEmailId({ email_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM EMAIL_ATTACHMENTS WHERE email_id = ${email_id} ORDER BY id ASC`,
	}).catch((error) => logger.error(`getEmailAttachmentsByEmailId: ${error}`));
}

export async function getAllEmailAttachments() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAIL_ATTACHMENTS ORDER BY id ASC`,
	}).catch((error) => logger.error(`getAllEmailAttachments: ${error}`));
}

export async function getEmailAttachmentsByBatchId({ batch_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT EMAIL_ATTACHMENTS.*
				FROM EMAIL_ATTACHMENTS
				INNER JOIN EMAILS ON EMAILS.id = EMAIL_ATTACHMENTS.email_id
				WHERE EMAILS.batch_id = ${batch_id}`,
	}).catch((error) => logger.error(`getEmailAttachmentsByBatchId: ${error}`));
}
