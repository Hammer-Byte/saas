import { t } from "elysia";
import {
    addGemCategory,
    deleteGemCategory,
    listGemCategories,
    updateGemCategory,
} from "../../services/gem_categories.js";

export default function (app) {
    return app
        .get("/", listGemCategories, {
            query: t.Object({
                group_id: t.Optional(t.Numeric({ minimum: 1 })),
            }),
            detail: {
                tags: ["Gem Categories"],
                summary: "List GEM categories (optional group filter)",
            },
        })
        .post("/", addGemCategory, {
            body: t.Object({
                group_id: t.Numeric({ minimum: 1 }),
                name: t.String({
                    minLength: 1,
                    maxLength: 512,
                    error: "Category name is required",
                }),
            }),
            detail: {
                tags: ["Gem Categories"],
                summary: "Create GEM category",
            },
        })
        .patch("/:id", updateGemCategory, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            body: t.Object({
                group_id: t.Numeric({ minimum: 1 }),
                name: t.String({
                    minLength: 1,
                    maxLength: 512,
                    error: "Category name is required",
                }),
            }),
            detail: {
                tags: ["Gem Categories"],
                summary: "Update GEM category",
            },
        })
        .delete("/:id", deleteGemCategory, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Gem Categories"],
                summary: "Delete GEM category",
            },
        });
}
