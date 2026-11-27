import { t } from "elysia";
import {
    CONSULTATION_STATUSES,
} from "../../constants.js";
import {
    getConsultationBookings,
    rescheduleConsultationBooking,
    updateConsultationBookingStatus,
} from "../../services/consultation_bookings.js";

export default function (app) {
    return app
        .get("/", getConsultationBookings, {
            query: t.Object({
                from: t.Optional(t.String()),
                to: t.Optional(t.String()),
            }),
            detail: {
                tags: ["Consultation Bookings"],
                summary: "List consultation bookings",
            },
        })
        .patch("/:id/status", updateConsultationBookingStatus, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                status: t.Union([
                    t.Literal(CONSULTATION_STATUSES.OPEN),
                    t.Literal(CONSULTATION_STATUSES.COMPLETED),
                    t.Literal(CONSULTATION_STATUSES.NOT_ATTENDED),
                    t.Literal(CONSULTATION_STATUSES.CANCELLED),
                ]),
            }),
            detail: {
                tags: ["Consultation Bookings"],
                summary: "Update booking status",
            },
        })
        .post("/:id/reschedule", rescheduleConsultationBooking, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                slot_id: t.Optional(t.Numeric()),
                starts_at: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
            }),
            detail: {
                tags: ["Consultation Bookings"],
                summary: "Reschedule booking to another slot",
            },
        });
}
