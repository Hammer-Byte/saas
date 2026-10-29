import { t } from "elysia";
import { addInquiry } from "../../services/inquiries.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app.post("/", addInquiry, {
        body: t.Object({
            phone: t.String({
                minLength: 1,
                maxLength: 13,
                error: ERRORS.PHONE_REQUIRED,
            }),
            full_name: t.Optional(
                t.Union([
                    t.String({
                        maxLength: 128,
                    }),
                    t.Literal(""),
                    t.Null(),
                ]),
            ),
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
            source: t.Optional(
                t.Union([
                    t.String({
                        minLength: 1,
                        maxLength: 64,
                    }),
                    t.Literal(""),
                    t.Null(),
                ]),
            ),
            institute_name: t.Optional(
                t.Union([
                    t.String({
                        minLength: 1,
                        maxLength: 128,
                    }),
                    t.Literal(""),
                    t.Null(),
                ]),
            ),
            city: t.Optional(
                t.Union([
                    t.String({
                        minLength: 1,
                        maxLength: 64,
                    }),
                    t.Literal(""),
                    t.Null(),
                ]),
            ),
        }),
        detail: {
            tags: ["Inquiries"],
            summary: "Submit a contact inquiry",
            description:
                "Stores a website inquiry. Phone is required; full_name, email, source, institute_name, and city are optional.",
        },
    });
}
