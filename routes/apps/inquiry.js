import { t } from "elysia";
import { addInquiry } from "../../services/inquiries.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app.post("/", addInquiry, {
        body: t.Object({
            full_name: t.String({
                minLength: 1,
                maxLength: 128,
                error: ERRORS.FULL_NAME_REQUIRED,
            }),
            phone: t.String({
                minLength: 1,
                maxLength: 32,
                error: ERRORS.PHONE_REQUIRED,
            }),
            email: t.Optional(
                t.Union([
                    t.String({
                        format: "email",
                        maxLength: 255,
                        error: ERRORS.EMAIL_INVALID,
                    }),
                    t.Literal(""),
                    t.Null(),
                ]),
            ),
        }),
        detail: {
            tags: ["Inquiry"],
            summary: "Submit a contact inquiry",
            description: "Stores a website inquiry. Email is optional; full_name and phone are required.",
        },
    });
}
