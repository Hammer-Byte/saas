import { t } from "elysia";
import {
    CONTRACT_BROKEN_BY,
    USER_LOGIN_EMAILS,
    USER_LOGIN_METHODS,
    USER_PROFESSIONAL_EMAIL_PATTERN,
} from "../../constants.js";
import {
    addContract,
    breakContract,
    createContractInvite,
    deleteContract,
    deleteContractSigned,
    listContractAttachments,
    transferContractToUser,
    updateContract,
} from "../../services/contracts.js";

const requiredAttachmentsBody = t.Array(t.Numeric({ minimum: 1 }), {
    minItems: 1,
    error: "At least one required attachment is required",
});

const contractPartyBody = {
    company: t.Optional(t.Union([t.String({ maxLength: 128 }), t.Literal(""), t.Null()])),
    full_name: t.String({
        minLength: 1,
        maxLength: 128,
        error: "Full name is required",
    }),
    email: t.String({
        format: "email",
        maxLength: 255,
        error: "Valid email is required",
    }),
    phone: t.String({
        pattern: "^\\+?[0-9]{10,13}$",
        error: "Valid phone is required",
    }),
    address: t.String({
        minLength: 1,
        maxLength: 512,
        error: "Address is required",
    }),
    active: t.Boolean(),
    signable_till: t.String({
        minLength: 1,
        error: "Signable till is required",
    }),
    required_attachments: requiredAttachmentsBody,
};

export default function (app) {
    return app
        .get("/attachments", listContractAttachments, {
            detail: {
                tags: ["Contracts"],
                summary: "List contract attachment catalog",
            },
        })
        .post("/", addContract, {
            body: t.Object(contractPartyBody),
            detail: {
                tags: ["Contracts"],
                summary: "Create contract",
            },
        })
        .post("/:id/invite", createContractInvite, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Contracts"],
                summary: "Send contract signing invite email",
            },
        })
        .post("/:id/break", breakContract, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                break_date: t.String({
                    minLength: 1,
                    error: "Break date is required",
                }),
                broken_by: t.Union([
                    t.Literal(CONTRACT_BROKEN_BY.HAMMERBYTE),
                    t.Literal(CONTRACT_BROKEN_BY.CONTRACTOR),
                ]),
            }),
            detail: {
                tags: ["Contracts"],
                summary: "Mark contract as broken and notify party",
            },
        })
        .post("/:id/transfer-to-user", transferContractToUser, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                email: t.String({
                    minLength: 18,
                    maxLength: 48,
                    pattern: USER_PROFESSIONAL_EMAIL_PATTERN,
                    error: "Professional email must be @hammerbyte.co.in",
                }),
                personal_email: t.String({
                    minLength: 3,
                    maxLength: 128,
                    format: "email",
                    error: "Personal email is required",
                }),
                login_method: t.Union([
                    t.Literal(USER_LOGIN_METHODS.OTP),
                    t.Literal(USER_LOGIN_METHODS.PASSWORD),
                    t.Literal(USER_LOGIN_METHODS.BOTH),
                ]),
                login_email: t.Union([
                    t.Literal(USER_LOGIN_EMAILS.PROFESSIONAL),
                    t.Literal(USER_LOGIN_EMAILS.PERSONAL),
                ]),
                password: t.Optional(t.String({ maxLength: 128 })),
                hourly_rate: t.Optional(t.Union([t.Numeric({ minimum: 0 }), t.Null()])),
                role_ids: t.Optional(t.Array(t.Numeric({ minimum: 1 }))),
            }),
            detail: {
                tags: ["Contracts"],
                summary: "Create a user from a signed contract",
            },
        })
        .delete("/:id/signed", deleteContractSigned, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Contracts"],
                summary: "Clear signed attachments from contract",
            },
        })
        .patch("/:id", updateContract, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object(contractPartyBody),
            detail: {
                tags: ["Contracts"],
                summary: "Update contract",
            },
        })
        .delete("/:id", deleteContract, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Contracts"],
                summary: "Delete contract",
            },
        });
}
