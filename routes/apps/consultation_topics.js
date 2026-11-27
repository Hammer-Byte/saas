import { t } from "elysia";
import {
    addConsultationTopic,
    getConsultationTopics,
    updateConsultationTopic,
} from "../../services/consultation_topics.js";

export default function (app) {
    return app
        .get("/", getConsultationTopics, {
            query: t.Object({
                active_only: t.Optional(t.String()),
            }),
            detail: {
                tags: ["Consultation Topics"],
                summary: "List consultation topics",
            },
        })
        .post("/", addConsultationTopic, {
            body: t.Object({
                title: t.String({ minLength: 1, maxLength: 128 }),
                description: t.String({ minLength: 1, maxLength: 255 }),
                active: t.Optional(t.Boolean()),
            }),
            detail: {
                tags: ["Consultation Topics"],
                summary: "Create consultation topic",
            },
        })
        .patch("/:id", updateConsultationTopic, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                title: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
                description: t.Optional(
                    t.String({ minLength: 1, maxLength: 255 }),
                ),
                active: t.Optional(t.Boolean()),
            }),
            detail: {
                tags: ["Consultation Topics"],
                summary: "Update consultation topic",
            },
        });
}
