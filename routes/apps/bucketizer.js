import { t } from "elysia";
import hammerbyteUtils from "@hammerbyte/utils";
import { bucketize } from "../../services/bucketizer.js";
import { ERRORS } from "../../constants.js";

const { SERVICES } = hammerbyteUtils.CONSTANTS.SAAS;


export default function (app) {
    return app.post("/", bucketize, {
        body: t.Object({
            file: t.String({ error: ERRORS.BODY_REQUIRED }),
            accumulator: t.String({ error: ERRORS.BODY_REQUIRED }),
        }),
        detail: {
            tags: [SERVICES.BUCKETIZER],
            summary: "Bucketizer service",
            description: "S3-compatible storage (stub — extend with upload routes).",
        },
    });
}
