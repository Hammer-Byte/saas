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
			body: t.Object({
				interval: t.Number({ minimum: 0, error: ERRORS.VALIDATION.INTERVAL_REQUIRED }),
				emails: t.Array(t.Any(), {
					minItems: 1,
					error: ERRORS.VALIDATION.EMAILS_REQUIRED,
				}),
			}),
			detail: {
				tags: ["Email Batches"],
				summary: "Create and send email batch",
				description:
					"Persists a batch of emails with html bodies and media_ids attachments, then sends each email with interval delay via nodemailer.",
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
				description: "Deletes the batch and cascaded emails/recipients/ccs/bccs/attachments.",
			},
		});
}
