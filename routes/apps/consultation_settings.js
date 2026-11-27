import { t } from "elysia";
import {
    getConsultationSettingsAdmin,
    saveConsultationSettings,
} from "../../services/consultation_settings.js";

export default function (app) {
    return app
        .get("/", getConsultationSettingsAdmin, {
            detail: {
                tags: ["Consultation Settings"],
                summary: "Get consultation settings",
            },
        })
        .put("/", saveConsultationSettings, {
            body: t.Object({
                meeting_link: t.Optional(
                    t.Union([t.String({ maxLength: 512 }), t.Null()]),
                ),
                whatsapp_number: t.String({ minLength: 1, maxLength: 32 }),
                whatsapp_message: t.String({ minLength: 1 }),
            }),
            detail: {
                tags: ["Consultation Settings"],
                summary: "Save consultation settings",
            },
        });
}
