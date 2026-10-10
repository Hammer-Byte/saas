import { t } from "elysia";
import { deleteEmail, getEmail } from "../../services/email_batches.js";
import { ERRORS } from "../../constants.js";

const emailIdParams = t.Object({
	id: t.Number({ minimum: 1, error: ERRORS.VALIDATION.ID_REQUIRED }),
});

export default function emails(app) {
	return app
		.get("/:id", getEmail, {
			params: emailIdParams,
			detail: {
				tags: ["Emails"],
				summary: "Get email",
				description: "Returns a single email with recipients, ccs, bccs, attachments.",
			},
		})
		.delete("/:id", deleteEmail, {
			params: emailIdParams,
			detail: {
				tags: ["Emails"],
				summary: "Delete email",
				description:
					"Deletes an email and cascaded recipients/ccs/bccs/attachments, and unlinks attachment files.",
			},
		});
}
