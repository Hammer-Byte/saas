import { t } from "elysia";
import hammerbyteUtils from "@hammerbyte/utils";
import { bucketize, getBucketized } from "../../services/bucketizer.js";
import { ERRORS } from "../../constants.js";

const { SERVICES } = hammerbyteUtils.CONSTANTS.SAAS;


export default function (app) {
    return app
        .post("/", bucketize, {
            body: t.Object({
                file: t.String({ error: ERRORS.FILE_REQUIRED }),
                accumulator: t.String({ error: ERRORS.ACCUMULATOR_REQUIRED }),
            }),
            detail: {
                tags: [SERVICES.BUCKETIZER],
                summary: "Create presigned URLs for upload",
                description: "Returns presigned GET and PUT URLs for a generated object key.",
            },
        })
        .get("/:file", getBucketized, {
            params: t.Object({
                file: t.String({ error: ERRORS.FILE_REQUIRED }),
            }),
            query: t.Object({
                accumulator: t.String({ error: ERRORS.ACCUMULATOR_REQUIRED }),
            }),
            detail: {
                tags: [SERVICES.BUCKETIZER],
                summary: "Get URL for an object",
                description: "Returns a GET URL for `file` using the given `accumulator` visibility.",
            },
        });
}
