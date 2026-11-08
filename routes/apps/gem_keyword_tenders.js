import { t } from "elysia";
import { GEM_KEYWORD_TENDER_STAGES } from "../../constants.js";
import { updateGemKeywordTender } from "../../services/gem_keyword_tenders.js";

export default function (app) {
    return app.patch("/:id", updateGemKeywordTender, {
        params: t.Object({
            id: t.Numeric(),
        }),
        body: t.Object({
            quote: t.Optional(t.String()),
            stage: t.Optional(
                t.Union([
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.NEW),
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.OUT_OF_SCOPE),
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.UNATTENDED),
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.ASSIGNED),
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.ELIGIBLE),
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.NOT_ELIGIBLE),
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.FILED),
                ]),
            ),
            assignee_user_id: t.Optional(t.Union([t.Numeric({ minimum: 1 }), t.Null()])),
            assign_to_me: t.Optional(t.Boolean()),
        }),
        detail: {
            tags: ["GEM Keyword Tenders"],
            summary: "Update a GEM keyword tender",
        },
    });
}
