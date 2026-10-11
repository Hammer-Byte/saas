import { createEmailBatch, deleteEmailBatchById, getAllEmailBatches, getEmailBatchById, updateEmailBatchById } from "../entities/email_batches.js";
import { getTemplateById } from "../entities/templates.js";
import { createEmail, deleteEmailById, getEmailById, updateEmailById } from "../entities/emails.js";
import { createEmailAttachment, getEmailAttachmentsByBatchId } from "../entities/email_attachments.js";
import { createEmailRecipient } from "../entities/email_recipients.js";
import { createEmailCc } from "../entities/email_ccs.js";
import { createEmailBcc } from "../entities/email_bccs.js";
import { removeStorageFile, writeAttachmentFile } from "../libs/storage.js";
import { transportEmail } from "../libs/transporter.js";
import { ERRORS } from "../constants.js";
import { sleep } from "../util.js";

const { filer, logger } = require("@hammerbyte/utils");

const ATTACHMENT_FIELD = /^attachment_(\d+)_(\d+)$/;

export async function getEmailBatches({ set }) {
	const emailBatches = await getAllEmailBatches();
	set.status = 200;
	return emailBatches;
}

export async function getEmailBatch({ params, set }) {
	const emailBatch = await getEmailBatchById({ id: params.id });
	if (!emailBatch) {
		set.status = 404;
		return { error: ERRORS.EMAIL_BATCH_NOT_FOUND };
	}
	set.status = 200;
	return emailBatch;
}

export async function addEmailBatch({ body, user, set }) {
	const templateId = Number(body.template_id);
	const interval = Number(body.interval);

	const template = await getTemplateById({ id: templateId });
	if (!template) {
		set.status = 404;
		return { error: ERRORS.TEMPLATE_NOT_FOUND };
	}

	let emails;
	try {
		emails = typeof body.emails === "string" ? JSON.parse(body.emails) : body.emails;
	} catch (exception) {
		logger.error(`addEmailBatch emails parse: ${exception}`);
		set.status = 400;
		return { error: ERRORS.INVALID_EMAILS_PAYLOAD };
	}

	if (!Array.isArray(emails) || !emails.length) {
		set.status = 400;
		return { error: ERRORS.INVALID_EMAILS_PAYLOAD };
	}

	for (const email of emails) {
		const inject = email.inject && typeof email.inject === "object" ? email.inject : {};
		for (const placeholder of template.placeholders || []) {
			if (!Object.hasOwn(inject, placeholder.place_holder)) {
				set.status = 400;
				return {
					error: ERRORS.MISSING_PLACEHOLDER_INJECT,
					place_holder: placeholder.place_holder,
				};
			}
		}
	}

	const attachmentFiles = new Map();
	for (const [key, value] of Object.entries(body || {})) {
		const match = key.match(ATTACHMENT_FIELD);
		if (!match || !value) {
			continue;
		}
		attachmentFiles.set(`${match[1]}_${match[2]}`, value);
	}

	const emailBatch = await createEmailBatch({
		interval: Number.isFinite(interval) ? interval : 0,
		template_id: templateId,
		active: true,
		created_by: user.id,
		updated_by: user.id,
	});

	if (!emailBatch) {
		set.status = 400;
		return { error: ERRORS.INVALID_EMAILS_PAYLOAD };
	}

	for (let emailIndex = 0; emailIndex < emails.length; emailIndex += 1) {
		const email = emails[emailIndex];
		const createdEmail = await createEmail({
			batch_id: emailBatch.id,
			subject: String(email.subject || "").trim(),
			inject: email.inject || {},
			sent: false,
			created_by: user.id,
			updated_by: user.id,
		});

		for (const recipient of email.recipients || []) {
			await createEmailRecipient({
				email_id: createdEmail.id,
				recipient: String(recipient).trim(),
				created_by: user.id,
				updated_by: user.id,
			});
		}

		for (const cc of email.ccs || []) {
			await createEmailCc({
				email_id: createdEmail.id,
				cc: String(cc).trim(),
				created_by: user.id,
				updated_by: user.id,
			});
		}

		for (const bcc of email.bccs || []) {
			await createEmailBcc({
				email_id: createdEmail.id,
				bcc: String(bcc).trim(),
				created_by: user.id,
				updated_by: user.id,
			});
		}

		const attachments = email.attachments || [];
		for (let fileIndex = 0; fileIndex < attachments.length; fileIndex += 1) {
			const attachment = attachments[fileIndex];
			const fileField = attachmentFiles.get(`${emailIndex}_${fileIndex}`);
			if (!fileField) {
				set.status = 400;
				return { error: ERRORS.ATTACHMENT_FILE_REQUIRED };
			}

			const filePath = await writeAttachmentFile({
				data: fileField,
				originalName: attachment.name || fileField.name || "file.bin",
			});

			await createEmailAttachment({
				email_id: createdEmail.id,
				file: filePath,
				name: String(attachment.name || fileField.name || "file.bin"),
				created_by: user.id,
				updated_by: user.id,
			});
		}
	}

	const persistedBatch = await getEmailBatchById({ id: emailBatch.id });
	const sendResults = [];
	let isFirst = true;

	for (const email of persistedBatch.emails || []) {
		if (!isFirst && persistedBatch.interval > 0) {
			await sleep({ seconds: persistedBatch.interval });
		}
		isFirst = false;

		try {
			const html = filer.prepareTemplated(template.file, email.inject || {});

			await transportEmail({
				recipients: (email.recipients || []).map(
					(emailRecipient) => emailRecipient.recipient,
				),
				ccs: (email.ccs || []).map((emailCc) => emailCc.cc),
				bccs: (email.bccs || []).map((emailBcc) => emailBcc.bcc),
				subject: email.subject,
				html,
				attachments: (email.attachments || []).map((emailAttachment) => ({
					...emailAttachment,
				})),
			});

			await updateEmailById({
				id: email.id,
				sent: true,
				updated_by: user.id,
			});

			sendResults.push({ id: email.id, sent: true });
		} catch (exception) {
			logger.error(`addEmailBatch send ${email.id}: ${exception}`);
			sendResults.push({ id: email.id, sent: false, error: String(exception) });
		}
	}

	await updateEmailBatchById({
		id: emailBatch.id,
		active: false,
		updated_by: user.id,
	});

	const completedBatch = await getEmailBatchById({ id: emailBatch.id });
	set.status = 201;
	return { ...completedBatch, send_results: sendResults };
}

export async function updateEmailBatch({ params, body, user, set }) {
	const emailBatch = await getEmailBatchById({ id: params.id });
	if (!emailBatch) {
		set.status = 404;
		return { error: ERRORS.EMAIL_BATCH_NOT_FOUND };
	}

	await updateEmailBatchById({
		id: params.id,
		active: body.active,
		updated_by: user.id,
	});
	const updatedEmailBatch = await getEmailBatchById({ id: params.id });

	set.status = 200;
	return updatedEmailBatch;
}

export async function deleteEmailBatch({ params, set }) {
	const emailBatch = await getEmailBatchById({ id: params.id });
	if (!emailBatch) {
		set.status = 404;
		return { error: ERRORS.EMAIL_BATCH_NOT_FOUND };
	}

	const emailAttachments = await getEmailAttachmentsByBatchId({
		batch_id: params.id,
	});

	for (const emailAttachment of emailAttachments || []) {
		await removeStorageFile({ path: emailAttachment.file });
	}

	deleteEmailBatchById({ id: params.id });
	set.status = 204;
}

export async function deleteEmail({ params, set }) {
	const email = await getEmailById({ id: params.id });
	if (!email) {
		set.status = 404;
		return { error: ERRORS.EMAIL_NOT_FOUND };
	}

	for (const emailAttachment of email.attachments || []) {
		await removeStorageFile({ path: emailAttachment.file });
	}

	deleteEmailById({ id: params.id });
	set.status = 204;
}

export async function getEmail({ params, set }) {
	const email = await getEmailById({ id: params.id });
	if (!email) {
		set.status = 404;
		return { error: ERRORS.EMAIL_NOT_FOUND };
	}
	set.status = 200;
	return email;
}
