import { t } from "elysia";
import { startGemScannerScan } from "../../services/gem_scanner.js";

export default function (app) {
    return app.post("/scan", startGemScannerScan, {
        body: t.Object({
            keyword_ids: t.Optional(t.Array(t.Numeric({ minimum: 1 }))),
            category_ids: t.Optional(t.Array(t.Numeric({ minimum: 1 }))),
        }),
        detail: {
            tags: ["GEM Scanner"],
            summary:
                "Start a queued GeM scan: Direct Search keywords first, then Advance Search categories",
        },
    });
}
