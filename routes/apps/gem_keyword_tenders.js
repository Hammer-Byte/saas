import { t } from "elysia";
import { updateGemKeywordTender } from "../../services/gem_keyword_tenders.js";

export default function (app) {
    return app.patch("/:id", updateGemKeywordTender, {
        params: t.Object({
            id: t.Numeric(),
        }),
        body: t.Object({
            hidden: t.Optional(t.Boolean()),
            eligible: t.Optional(t.Boolean()),
            filed: t.Optional(t.Boolean()),
            quote: t.Optional(t.String()),
        }),
        detail: {
            tags: ["GEM Keyword Tenders"],
            summary: "Update a GEM keyword tender",
        },
    });
}
