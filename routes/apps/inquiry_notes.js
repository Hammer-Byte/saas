import { t } from "elysia";
import {
    addInquiryNote,
    deleteInquiryNote,
    updateInquiryNote,
} from "../../services/inquiry_notes.js";

export default function (app) {
    return app
        .post("/", addInquiryNote, {
            body: t.Object({
                inquiry_id: t.Numeric({ minimum: 1 }),
                note: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["Inquiry Notes"],
                summary: "Add an inquiry note",
            },
        })
        .patch("/:id", updateInquiryNote, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                note: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["Inquiry Notes"],
                summary: "Update an inquiry note",
            },
        })
        .delete("/:id", deleteInquiryNote, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Inquiry Notes"],
                summary: "Delete an inquiry note",
            },
        });
}
