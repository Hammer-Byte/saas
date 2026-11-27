import { t } from "elysia";
import {
    addConsultationSlot,
    getConsultationSlots,
    updateConsultationSlot,
} from "../../services/consultation_slots.js";

export default function (app) {
    return app
        .get("/", getConsultationSlots, {
            query: t.Object({
                from: t.Optional(t.String()),
                to: t.Optional(t.String()),
            }),
            detail: {
                tags: ["Consultation Slots"],
                summary: "List consultation slots",
            },
        })
        .post("/", addConsultationSlot, {
            body: t.Object({
                starts_at: t.String({ minLength: 1, maxLength: 32 }),
            }),
            detail: {
                tags: ["Consultation Slots"],
                summary: "Create consultation slot",
            },
        })
        .patch("/:id", updateConsultationSlot, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                starts_at: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
                active: t.Optional(t.Boolean()),
            }),
            detail: {
                tags: ["Consultation Slots"],
                summary: "Update consultation slot",
            },
        });
}
