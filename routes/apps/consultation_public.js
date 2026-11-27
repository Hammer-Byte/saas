import { t } from "elysia";
import {
    getPublicConsultationTopics,
    requestConsultationOtp,
    verifyConsultationOtpAndBook,
} from "../../services/consultation_bookings.js";
import { getPublicAvailableConsultationSlots } from "../../services/consultation_slots.js";
import { getPublicConsultationSettings } from "../../services/consultation_settings.js";

export function publicConsultation(app) {
    return app
        .get("/topics", getPublicConsultationTopics, {
            detail: {
                tags: ["Consultation Public"],
                summary: "List active consultation topics",
            },
        })
        .get("/slots", getPublicAvailableConsultationSlots, {
            detail: {
                tags: ["Consultation Public"],
                summary: "List available consultation slots",
            },
        })
        .get("/settings", getPublicConsultationSettings, {
            detail: {
                tags: ["Consultation Public"],
                summary: "Public WhatsApp and booking settings",
            },
        })
        .post("/otp", requestConsultationOtp, {
            body: t.Object({
                full_name: t.String({ minLength: 1, maxLength: 128 }),
                phone: t.String({ minLength: 8, maxLength: 32 }),
                email: t.String({ minLength: 3, maxLength: 255 }),
                topic_id: t.Numeric({ minimum: 1 }),
                slot_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Consultation Public"],
                summary: "Request consultation booking OTP",
            },
        })
        .post("/book", verifyConsultationOtpAndBook, {
            body: t.Object({
                verification_token: t.String({ minLength: 1, maxLength: 64 }),
                otp: t.String({ minLength: 4, maxLength: 4 }),
            }),
            detail: {
                tags: ["Consultation Public"],
                summary: "Verify OTP and create consultation booking",
            },
        });
}
