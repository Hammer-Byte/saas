import { t } from "elysia";
import { ERRORS } from "../../constants.js";
import { addManualInquiry, updateInquiry } from "../../services/inquiries.js";

export default function (app) {
    return app
        .post("/manual", addManualInquiry, {
            body: t.Object({
                phone: t.String({
                    minLength: 1,
                    maxLength: 13,
                    error: ERRORS.PHONE_REQUIRED,
                }),
                full_name: t.Optional(
                    t.Union([
                        t.String({ maxLength: 128 }),
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
                institute_name: t.Optional(
                    t.Union([
                        t.String({ maxLength: 128 }),
                        t.Literal(""),
                        t.Null(),
                    ]),
                ),
                city: t.Optional(
                    t.Union([
                        t.String({ maxLength: 64 }),
                        t.Literal(""),
                        t.Null(),
                    ]),
                ),
                quote: t.Optional(
                    t.Union([t.String(), t.Literal(""), t.Null()]),
                ),
                state: t.Optional(
                    t.Union([
                        t.Literal("new"),
                        t.Literal("assigned"),
                        t.Literal("in_progress"),
                        t.Literal("potential"),
                        t.Literal("ignored"),
                        t.Literal("closed"),
                        t.Literal("canceled"),
                    ]),
                ),
                assignee_user_id: t.Optional(
                    t.Union([t.Numeric({ minimum: 1 }), t.Null()]),
                ),
            }),
            detail: {
                tags: ["Inquiries"],
                summary: "Manually create an inquiry",
            },
        })
        .patch("/:id", updateInquiry, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                state: t.Optional(
                    t.Union([
                        t.Literal("new"),
                        t.Literal("assigned"),
                        t.Literal("in_progress"),
                        t.Literal("potential"),
                        t.Literal("ignored"),
                        t.Literal("closed"),
                        t.Literal("canceled"),
                    ]),
                ),
                assignee_user_id: t.Optional(
                    t.Union([t.Numeric({ minimum: 1 }), t.Null()]),
                ),
                assign_to_me: t.Optional(t.Boolean()),
                quote: t.Optional(
                    t.Union([t.String(), t.Literal(""), t.Null()]),
                ),
                full_name: t.Optional(
                    t.Union([
                        t.String({ maxLength: 128 }),
                        t.Literal(""),
                        t.Null(),
                    ]),
                ),
                phone: t.Optional(
                    t.String({
                        minLength: 1,
                        maxLength: 13,
                        error: ERRORS.PHONE_REQUIRED,
                    }),
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
                institute_name: t.Optional(
                    t.Union([
                        t.String({ maxLength: 128 }),
                        t.Literal(""),
                        t.Null(),
                    ]),
                ),
                city: t.Optional(
                    t.Union([
                        t.String({ maxLength: 64 }),
                        t.Literal(""),
                        t.Null(),
                    ]),
                ),
                source: t.Optional(
                    t.Union([
                        t.String({ maxLength: 64 }),
                        t.Literal(""),
                        t.Null(),
                    ]),
                ),
            }),
            detail: {
                tags: ["Inquiries"],
                summary: "Update an inquiry",
            },
        });
}
