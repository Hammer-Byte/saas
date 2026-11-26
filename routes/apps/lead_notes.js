import { t } from "elysia";
import {
    addLeadNote,
    deleteLeadNote,
    updateLeadNote,
} from "../../services/lead_notes.js";

export default function (app) {
    return app
        .post("/", addLeadNote, {
            body: t.Object({
                lead_id: t.Numeric({ minimum: 1 }),
                note: t.String({ minLength: 1 }),
                file: t.Optional(t.File()),
            }),
            detail: {
                tags: ["Lead Notes"],
                summary: "Add a lead note (optional attachment)",
            },
        })
        .patch("/:id", updateLeadNote, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                note: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["Lead Notes"],
                summary: "Update a lead note",
            },
        })
        .delete("/:id", deleteLeadNote, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Lead Notes"],
                summary: "Delete a lead note",
            },
        });
}
