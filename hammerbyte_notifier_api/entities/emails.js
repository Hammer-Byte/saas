import { executeSQLQuery } from "../libs/db.js";
import { getAllEmailAttachments, getEmailAttachmentsByEmailId } from "./email_attachments.js";
import { getAllEmailBccs, getEmailBccsByEmailId } from "./email_bccs.js";
import { getAllEmailCcs, getEmailCcsByEmailId } from "./email_ccs.js";
import { getAllEmailRecipients, getEmailRecipientsByEmailId } from "./email_recipients.js";

const { logger } = require("@hammerbyte/utils");

function parseInject({ inject }) {
	if (typeof inject !== "string") {
		return inject || {};
	}
	return JSON.parse(inject || "{}");
}

function groupByEmailId({ rows }) {
	const byEmailId = new Map();
	for (const entry of rows || []) {
		if (!byEmailId.has(entry.email_id)) {
			byEmailId.set(entry.email_id, []);
		}
		byEmailId.get(entry.email_id).push(entry);
	}
	return byEmailId;
}

function attachEmailRelations({
	email,
	recipientsByEmailId,
	ccsByEmailId,
	bccsByEmailId,
	attachmentsByEmailId,
}) {
	email.recipients = recipientsByEmailId.get(email.id) || [];
	email.ccs = ccsByEmailId.get(email.id) || [];
	email.bccs = bccsByEmailId.get(email.id) || [];
	email.attachments = attachmentsByEmailId.get(email.id) || [];
	email.inject = parseInject({ inject: email.inject });
	return email;
}

export async function createEmail({
	batch_id,
	subject,
	inject = {},
	sent = false,
	created_by = null,
	updated_by = null,
}) {
	const email = {
		batch_id,
		subject,
		inject: typeof inject === "string" ? inject : JSON.stringify(inject || {}),
		sent: !!sent,
		created_by,
		updated_by,
	};

	return await executeSQLQuery({
		queryFunction: (sql) => sql`INSERT INTO EMAILS ${sql(email)}`,
	})
		.then((emailInserted) => getEmailById({ id: Number(emailInserted.insertId) }))
		.catch((error) => logger.error(`createEmail: ${error}`));
}

export async function getEmailById({ id }) {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAILS WHERE id = ${id}`,
	})
		.then(async (emails) => {
			if (!emails.length) {
				return;
			}

			const email = emails[0];
			email.recipients = await getEmailRecipientsByEmailId({ email_id: email.id });
			email.ccs = await getEmailCcsByEmailId({ email_id: email.id });
			email.bccs = await getEmailBccsByEmailId({ email_id: email.id });
			email.attachments = await getEmailAttachmentsByEmailId({ email_id: email.id });
			email.inject = parseInject({ inject: email.inject });
			return email;
		})
		.catch((error) => logger.error(`getEmailById: ${error}`));
}

export async function getEmailsByBatchId({ batch_id }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT * FROM EMAILS WHERE batch_id = ${batch_id} ORDER BY id ASC`,
	})
		.then(async (emails) => {
			const emailRecipients = await getAllEmailRecipients();
			const emailCcs = await getAllEmailCcs();
			const emailBccs = await getAllEmailBccs();
			const emailAttachments = await getAllEmailAttachments();

			const recipientsByEmailId = groupByEmailId({ rows: emailRecipients });
			const ccsByEmailId = groupByEmailId({ rows: emailCcs });
			const bccsByEmailId = groupByEmailId({ rows: emailBccs });
			const attachmentsByEmailId = groupByEmailId({ rows: emailAttachments });

			for (const email of emails) {
				attachEmailRelations({
					email,
					recipientsByEmailId,
					ccsByEmailId,
					bccsByEmailId,
					attachmentsByEmailId,
				});
			}

			return emails;
		})
		.catch((error) => logger.error(`getEmailsByBatchId: ${error}`));
}

export async function getAllEmails() {
	return await executeSQLQuery({
		queryFunction: (sql) => sql`SELECT * FROM EMAILS ORDER BY id ASC`,
	})
		.then(async (emails) => {
			const emailRecipients = await getAllEmailRecipients();
			const emailCcs = await getAllEmailCcs();
			const emailBccs = await getAllEmailBccs();
			const emailAttachments = await getAllEmailAttachments();

			const recipientsByEmailId = groupByEmailId({ rows: emailRecipients });
			const ccsByEmailId = groupByEmailId({ rows: emailCcs });
			const bccsByEmailId = groupByEmailId({ rows: emailBccs });
			const attachmentsByEmailId = groupByEmailId({ rows: emailAttachments });

			for (const email of emails) {
				attachEmailRelations({
					email,
					recipientsByEmailId,
					ccsByEmailId,
					bccsByEmailId,
					attachmentsByEmailId,
				});
			}

			return emails;
		})
		.catch((error) => logger.error(`getAllEmails: ${error}`));
}

export async function updateEmailById({ id, ...email }) {
	if (Object.hasOwn(email, "sent")) {
		email.sent = !!email.sent;
	}
	if (Object.hasOwn(email, "inject") && typeof email.inject !== "string") {
		email.inject = JSON.stringify(email.inject || {});
	}

	await executeSQLQuery({
		queryFunction: (sql) => sql`UPDATE EMAILS SET ${sql(email)} WHERE id = ${id}`,
	}).catch((error) => logger.error(`updateEmailById: ${error}`));
}

export async function deleteEmailById({ id }) {
	await executeSQLQuery({
		queryFunction: (sql) => sql`DELETE FROM EMAILS WHERE id = ${id}`,
	}).catch((error) => logger.error(`deleteEmailById: ${error}`));
}
