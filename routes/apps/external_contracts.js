import { t } from "elysia";
import {
    addExternalContract,
    createExternalContractInvite,
    deleteExternalContract,
    deleteExternalContractSigned,
    updateExternalContract,
} from "../../services/external_contracts.js";

export default function (app) {
    return app
        .post("/", addExternalContract, {
            body: t.Object({
                company: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Company is required",
                }),
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
            }),
            detail: {
                tags: ["External Contracts"],
                summary: "Create external contract",
            },
        })
        .post("/:id/invite", createExternalContractInvite, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["External Contracts"],
                summary: "Send contract signing invite email",
            },
        })
        .delete("/:id/signed", deleteExternalContractSigned, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["External Contracts"],
                summary: "Clear signed media from external contract",
            },
        })
        .patch("/:id", updateExternalContract, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                company: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Company is required",
                }),
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
            }),
            detail: {
                tags: ["External Contracts"],
                summary: "Update external contract",
            },
        })
        .delete("/:id", deleteExternalContract, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["External Contracts"],
                summary: "Delete external contract",
            },
        });
}
