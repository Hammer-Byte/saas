import hammerbyteUtils from "@hammerbyte/utils";

const { SERVICES } = hammerbyteUtils.SAAS;

export default function (app) {
    return app.get("/", () => ({ service: SERVICES.BUCKETIZER, status: "ok" }), {
        detail: {
            tags: [SERVICES.BUCKETIZER],
            summary: "Bucketizer service",
            description: "S3-compatible storage (stub — extend with upload routes).",
        },
    });
}
