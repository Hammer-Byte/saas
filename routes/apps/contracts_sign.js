import { t } from "elysia";
import {
    getContract,
    getContractPdf,
    signContract,
    updateContractRequiredAttachmentMedia,
} from "../../services/contracts.js";
import { addMedia, getMedia } from "../../services/media.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/media", addMedia, {
            body: t.Object({
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
            }),
            detail: {
                tags: ["Contracts"],
                summary: "Upload media for contract signing",
            },
        })
        .get("/media/:id", getMedia, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Contracts"],
                summary: "Get contract media file",
            },
        })
        .patch("/required-attachments/:id", updateContractRequiredAttachmentMedia, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                media_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Contracts"],
                summary: "Attach media to a required contract attachment while signing",
            },
        })
        .patch("/sign", signContract, {
            body: t.Object({
                signing_code: t.String({
                    minLength: 8,
                    maxLength: 8,
                }),
            }),
            detail: {
                tags: ["Contracts"],
                summary: "Confirm contract signing after all required attachments have media",
            },
        })
        .get("/:signing_code/signed", getContractPdf, {
            params: t.Object({
                signing_code: t.String({
                    minLength: 8,
                    maxLength: 8,
                }),
            }),
            detail: {
                tags: ["Contracts"],
                summary: "Download signed contract PDF",
            },
        })
        .get("/sign/:signing_code", getContract, {
            params: t.Object({
                signing_code: t.String({
                    minLength: 8,
                    maxLength: 8,
                }),
            }),
            detail: {
                tags: ["Contracts"],
                summary: "Get contract by signing code",
            },
        });
}
