import { t } from "elysia";
import {
    addContract,
    createContractInvite,
    deleteContract,
    deleteContractSigned,
    listContractAttachments,
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
