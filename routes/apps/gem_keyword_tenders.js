import { t } from "elysia";
import {
    GEM_KEYWORD_TENDER_STAGES,
} from "../../constants.js";
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
            stage: t.Optional(
                t.Union([
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.NEW),
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.WORK_IN_PROGRESS),
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.FILED),
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_TECHNICAL),
                    t.Literal(GEM_KEYWORD_TENDER_STAGES.WAITING_FOR_FINANCIAL),
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
