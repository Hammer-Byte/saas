import { t } from "elysia";
import hammerbyteUtils from "@hammerbyte/utils";
import { createMail } from "../../services/mailer.js";
import { ERRORS } from "../../constants.js";

const { SERVICES } = hammerbyteUtils.SAAS;


export default function (app) {
    return app.post("/", createMail, {
        body: t.Object({
            to: t.String({
                format: "email",
                maxLength: 32,
                error: ERRORS.TO_REQUIRED,
            }),
            subject: t.String({ error: ERRORS.SUBJECT_REQUIRED }),
            body: t.String({
                maxLength: 1024,
                error: ERRORS.BODY_REQUIRED,
            }),
            html_enabled: t.Boolean({ error: ERRORS.HTML_ENABLED_REQUIRED }),
        }),
        detail: {
            tags: [SERVICES.MAILER],
            summary: "Create/Send a New Email",
            description: "As Saas Send new Email",
        },
    });
}

