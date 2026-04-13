import { t } from "elysia";
import hammerbyteUtils from "@hammerbyte/utils";
import {  sendMail } from "../../services/mailer.js";
import { ERRORS } from "../../constants.js";

const { SERVICES } = hammerbyteUtils.CONSTANTS.SAAS;


export default function (app) {
    return app.post("/", sendMail, {
        body: t.Object({
            recipient: t.String({
                format: "email",
                maxLength: 32,
                error: ERRORS.RECIPIENT_REQUIRED,
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

