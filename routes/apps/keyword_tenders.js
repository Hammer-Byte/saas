import { t } from "elysia";
import { updateKeywordTender } from "../../services/keyword_tenders.js";

export default function (app) {
    return app.patch("/:id", updateKeywordTender, {
        params: t.Object({
            id: t.Numeric(),
        }),
        body: t.Object({
            hidden: t.Boolean(),
        }),
        detail: {
            tags: ["Keyword Tenders"],
            summary: "Update a GEM keyword tender",
        },
    });
}
