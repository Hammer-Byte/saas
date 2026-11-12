import { t } from "elysia";
import {
    addGemTenderCategory,
    deleteGemTenderCategory,
    listGemTenderCategories,
    updateGemTenderCategory,
} from "../../services/gem_tender_categories.js";

export default function (app) {
    return app
        .get("/", listGemTenderCategories, {
            detail: {
                tags: ["GEM Tender Categories"],
                summary: "List HammerByte tender categories",
            },
        })
        .post("/", addGemTenderCategory, {
            body: t.Object({
                name: t.String({
                    minLength: 1,
                    maxLength: 255,
                    error: "Category name is required",
                }),
            }),
            detail: {
                tags: ["GEM Tender Categories"],
                summary: "Create HammerByte tender category",
            },
        })
        .patch("/:id", updateGemTenderCategory, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            body: t.Object({
                name: t.String({
                    minLength: 1,
                    maxLength: 255,
                    error: "Category name is required",
                }),
            }),
            detail: {
                tags: ["GEM Tender Categories"],
                summary: "Update HammerByte tender category",
            },
        })
        .delete("/:id", deleteGemTenderCategory, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["GEM Tender Categories"],
                summary: "Delete HammerByte tender category",
            },
        });
}
