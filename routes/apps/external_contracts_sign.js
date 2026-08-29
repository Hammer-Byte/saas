import { t } from "elysia";
import {
    getExternalContract,
    getExternalContractPdf,
    signExternalContract,
} from "../../services/external_contracts.js";
import { addMedia, getMedia } from "../../services/media.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/media", addMedia, {
            body: t.Object({
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
            }),
            detail: {
                tags: ["External Contracts"],
                summary: "Upload media for external contract signing",
            },
        })
        .get("/media/:id", getMedia, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["External Contracts"],
                summary: "Get external contract media file",
            },
        })
        .patch("/sign", signExternalContract, {
            body: t.Object({
                signing_code: t.String({
                    minLength: 8,
                    maxLength: 8,
                }),
                signature: t.Numeric({ minimum: 1 }),
                selfie: t.Numeric({ minimum: 1 }),
                identity: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["External Contracts"],
                summary: "Sign external contract with uploaded media",
            },
        })
        .get("/:signing_code/signed", getExternalContractPdf, {
            params: t.Object({
                signing_code: t.String({
                    minLength: 8,
                    maxLength: 8,
                }),
            }),
            detail: {
                tags: ["External Contracts"],
                summary: "Download signed external contract PDF",
            },
        })
        .get("/sign/:signing_code", getExternalContract, {
            params: t.Object({
                signing_code: t.String({
                    minLength: 8,
                    maxLength: 8,
                }),
            }),
            detail: {
                tags: ["External Contracts"],
                summary: "Get external contract by signing code",
            },
        });
}
