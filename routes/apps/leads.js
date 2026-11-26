import { t } from "elysia";
import { LEAD_EMAIL_KINDS } from "../../constants.js";
import { addLead, deleteLead, getLeads, updateLead } from "../../services/leads.js";

const phoneRowSchema = t.Object({
    phone: t.String({ minLength: 1, maxLength: 32 }),
    is_whatsapp: t.Optional(t.Boolean()),
});

const emailRowSchema = t.Object({
    email: t.String({ minLength: 3, maxLength: 255 }),
    kind: t.Optional(
        t.Union([
            t.Literal(LEAD_EMAIL_KINDS.PERSONAL),
            t.Literal(LEAD_EMAIL_KINDS.PROFESSIONAL),
        ]),
    ),
});

const leadBodySchema = t.Object({
    full_name: t.String({ minLength: 1, maxLength: 128 }),
    website: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
    organization: t.Optional(t.Union([t.String({ maxLength: 128 }), t.Null()])),
    designation: t.Optional(t.Union([t.String({ maxLength: 128 }), t.Null()])),
    location: t.Optional(t.Union([t.String({ maxLength: 128 }), t.Null()])),
    refer_by: t.Optional(t.Union([t.String({ maxLength: 128 }), t.Null()])),
    targeted_for: t.Optional(t.Union([t.String(), t.Null()])),
    source: t.Optional(t.Union([t.String(), t.Null()])),
    note: t.Optional(t.Union([t.String(), t.Null()])),
    phones: t.Array(phoneRowSchema, { minItems: 1 }),
    emails: t.Array(emailRowSchema, { minItems: 1 }),
});

export default function (app) {
    return app
        .get("/", getLeads, {
            query: t.Object({
                from: t.Optional(t.String()),
                to: t.Optional(t.String()),
            }),
            detail: {
                tags: ["Leads"],
                summary: "List leads by created date range",
            },
        })
        .post("/", addLead, {
            body: leadBodySchema,
            detail: {
                tags: ["Leads"],
                summary: "Create lead",
            },
        })
        .patch("/:id", updateLead, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: leadBodySchema,
            detail: {
                tags: ["Leads"],
                summary: "Update lead",
            },
        })
        .delete("/:id", deleteLead, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Leads"],
                summary: "Delete lead",
            },
        });
}
