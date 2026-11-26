import { t } from "elysia";
import {
    addLeadSource,
    deleteLeadSource,
    getLeadSources,
    updateLeadSource,
} from "../../services/lead_sources.js";

export default function (app) {
    return app
        .get("/", getLeadSources, {
            detail: {
                tags: ["Lead Sources"],
                summary: "List lead sources",
            },
        })
        .post("/", addLeadSource, {
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Source title is required",
                }),
            }),
            detail: {
                tags: ["Lead Sources"],
                summary: "Create lead source",
            },
        })
        .patch("/:id", updateLeadSource, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Source title is required",
                }),
            }),
            detail: {
                tags: ["Lead Sources"],
                summary: "Update lead source",
            },
        })
        .delete("/:id", deleteLeadSource, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Lead Sources"],
                summary: "Delete lead source",
            },
        });
}
