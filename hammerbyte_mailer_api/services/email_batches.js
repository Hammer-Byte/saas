import { getMediaById } from "../apis/media.js";
import { createEmailBatch, deleteEmailBatchById, getAllEmailBatches, getEmailBatchById, updateEmailBatchById } from "../entities/email_batches.js";
import { createEmail, deleteEmailById, getEmailById, updateEmailById } from "../entities/emails.js";
import { createEmailAttachment, updateEmailAttachmentById } from "../entities/email_attachments.js";
import { createEmailRecipient } from "../entities/email_recipients.js";
import { createEmailCc } from "../entities/email_ccs.js";
import { createEmailBcc } from "../entities/email_bccs.js";
import { transportEmail } from "../libs/transporter.js";
import { ERRORS } from "../constants.js";
import { sleep } from "../util.js";

const { logger } = require("@hammerbyte/utils");

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

export async function addEmailBatch({ body, user, set, authentication_token }) {
	const interval = Number(body.interval);

	for (const email of body.emails) {
		const html = String(email.html || "").trim();
		if (!html) {
			set.status = 400;
			return { error: ERRORS.HTML_REQUIRED };
		}

		if (!Array.isArray(email.recipients) || !email.recipients.length) {
			set.status = 400;
			return { error: ERRORS.RECIPIENTS_REQUIRED };
		}

		for (const mediaIdRaw of email.media_ids || []) {
			const mediaId = Number(mediaIdRaw);
			if (!Number.isFinite(mediaId) || mediaId < 1) {
				set.status = 400;
				return { error: ERRORS.MEDIA_ID_REQUIRED };
			}
		}
	}

	const emailBatch = await createEmailBatch({
		interval: Number.isFinite(interval) ? interval : 0,
		active: true,
		created_by: user.id,
		updated_by: user.id,
	});

	if (!emailBatch) {
		set.status = 400;
		return { error: ERRORS.INVALID_EMAILS_PAYLOAD };
	}

	for (const email of body.emails) {
		const createdEmail = await createEmail({
			batch_id: emailBatch.id,
			subject: String(email.subject || "").trim(),
			html: String(email.html || ""),
			sent: false,
			created_by: user.id,
			updated_by: user.id,
		});

		for (const recipient of email.recipients) {
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

		for (const mediaIdRaw of email.media_ids || []) {
			const mediaId = Number(mediaIdRaw);
			await createEmailAttachment({
				email_id: createdEmail.id,
				media_id: mediaId,
				name: String(mediaId),
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
			const mailAttachments = [];
			for (const emailAttachment of email.attachments || []) {
				const media = await getMediaById({
					id: emailAttachment.media_id,
					authentication_token,
				});
				if (!media || !media.content) {
					throw new Error(ERRORS.MEDIA_NOT_FOUND);
				}
				const filename = media.filename || emailAttachment.name || "file.bin";
				if (filename !== emailAttachment.name) {
					await updateEmailAttachmentById({
						id: emailAttachment.id,
						name: filename,
						updated_by: user.id,
					});
				}
				mailAttachments.push({
					...media,
					filename,
				});
			}

			await transportEmail({
				...email,
				recipients: (email.recipients || []).map(
					(emailRecipient) => emailRecipient.recipient,
				),
				ccs: (email.ccs || []).map((emailCc) => emailCc.cc),
				bccs: (email.bccs || []).map((emailBcc) => emailBcc.bcc),
				attachments: mailAttachments,
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

	deleteEmailBatchById({ id: params.id });
	set.status = 204;
}

export async function deleteEmail({ params, set }) {
	const email = await getEmailById({ id: params.id });
	if (!email) {
		set.status = 404;
		return { error: ERRORS.EMAIL_NOT_FOUND };
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
