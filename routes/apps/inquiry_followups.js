import { t } from "elysia";
import { addInquiryFollowup } from "../../services/inquiry_followups.js";

export default function (app) {
    return app.post("/", addInquiryFollowup, {
        body: t.Object({
            inquiry_id: t.Numeric({ minimum: 1 }),
            slot: t.Numeric({ minimum: 1, maximum: 3 }),
            note: t.String({ minLength: 1 }),
            followed_up_on: t.Optional(
                t.Union([t.String({ minLength: 1 }), t.Null()]),
            ),
        }),
        detail: {
            tags: ["Inquiry Followups"],
            summary: "Record an inquiry follow-up",
        },
    });
}
