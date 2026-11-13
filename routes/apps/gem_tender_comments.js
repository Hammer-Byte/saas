import { t } from "elysia";
import {
    addGemTenderComment,
    deleteGemTenderComment,
    updateGemTenderComment,
} from "../../services/gem_tender_comments.js";

export default function (app) {
    return app
        .post("/", addGemTenderComment, {
            body: t.Object({
                gem_tender_id: t.Numeric({ minimum: 1 }),
                comment: t.String({ minLength: 1 }),
                file: t.Optional(t.File()),
            }),
            detail: {
                tags: ["GEM Tender Comments"],
                summary: "Add a GEM tender comment (optional attachment)",
            },
        })
        .patch("/:id", updateGemTenderComment, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                comment: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["GEM Tender Comments"],
                summary: "Update a GEM tender comment",
            },
        })
        .delete("/:id", deleteGemTenderComment, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["GEM Tender Comments"],
                summary: "Delete a GEM tender comment",
            },
        });
}
