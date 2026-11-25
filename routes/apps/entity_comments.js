import { t } from "elysia";
import {
    addEntityComment,
    deleteEntityComment,
    updateEntityComment,
} from "../../services/entity_comments.js";

export default function (app) {
    return app
        .post("/", addEntityComment, {
            body: t.Object({
                entity_type: t.String({ minLength: 1, maxLength: 32 }),
                entity_id: t.Numeric({ minimum: 1 }),
                comment: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["Entity Comments"],
                summary: "Add a comment on a record",
            },
        })
        .patch("/:id", updateEntityComment, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                comment: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["Entity Comments"],
                summary: "Update a comment",
            },
        })
        .delete("/:id", deleteEntityComment, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Entity Comments"],
                summary: "Delete a comment",
            },
        });
}
