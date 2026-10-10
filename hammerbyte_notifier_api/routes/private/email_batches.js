import { t } from "elysia";
import { addEmailBatch, deleteEmailBatch, getEmailBatch, getEmailBatches, updateEmailBatch } from "../../services/email_batches.js";
import { ERRORS } from "../../constants.js";

const emailBatchIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function emailBatches(app) {
	return app
		.get("/", getEmailBatches, {
			detail: {
				tags: ["Email Batches"],
				summary: "List email batches",
				description: "Returns all email batches with nested emails.",
			},
		})
		.get("/:id", getEmailBatch, {
			params: emailBatchIdParams,
			detail: {
				tags: ["Email Batches"],
				summary: "Get email batch",
				description: "Returns a batch with emails, recipients, ccs, bccs, attachments.",
			},
		})
		.post("/", addEmailBatch, {
			type: "multipart/form-data",
			body: t.Object(
				{
					interval: t.Union([
						t.Number({ minimum: 0, error: ERRORS.VALIDATION.INTERVAL_REQUIRED }),
						t.String({ minLength: 1, error: ERRORS.VALIDATION.INTERVAL_REQUIRED }),
					]),
					template_id: t.Union([
						t.Number({
							minimum: 1,
							error: ERRORS.VALIDATION.TEMPLATE_ID_REQUIRED,
						}),
						t.String({
							minLength: 1,
							error: ERRORS.VALIDATION.TEMPLATE_ID_REQUIRED,
						}),
					]),
					emails: t.String({
						minLength: 1,
						error: ERRORS.VALIDATION.EMAILS_REQUIRED,
					}),
				},
				{ additionalProperties: true },
			),
			detail: {
				tags: ["Email Batches"],
				summary: "Create and send email batch",
				description:
					"Persists a batch and emails from multipart form-data, writes attachments to storage, then sends each email with interval delay via nodemailer.",
			},
		})
		.patch("/:id", updateEmailBatch, {
			params: emailBatchIdParams,
			body: t.Object({
				active: t.Boolean({ error: ERRORS.VALIDATION.ACTIVE_REQUIRED }),
			}),
			detail: {
				tags: ["Email Batches"],
				summary: "Update email batch",
				description: "Updates batch active flag.",
			},
		})
		.delete("/:id", deleteEmailBatch, {
			params: emailBatchIdParams,
			detail: {
				tags: ["Email Batches"],
				summary: "Delete email batch",
				description:
					"Deletes the batch and cascaded emails/recipients/ccs/bccs/attachments, and unlinks attachment files.",
			},
		});
}
