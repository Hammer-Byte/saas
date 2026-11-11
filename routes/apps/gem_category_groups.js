import { t } from "elysia";
import {
    addGemCategoryGroup,
    deleteGemCategoryGroup,
    listGemCategoryGroups,
    updateGemCategoryGroup,
} from "../../services/gem_categories.js";

export default function (app) {
    return app
        .get("/", listGemCategoryGroups, {
            detail: {
                tags: ["Gem Category Groups"],
                summary: "List GEM category groups",
            },
        })
        .post("/", addGemCategoryGroup, {
            body: t.Object({
                name: t.String({
                    minLength: 1,
                    maxLength: 255,
                    error: "Group name is required",
                }),
            }),
            detail: {
                tags: ["Gem Category Groups"],
                summary: "Create GEM category group",
            },
        })
        .patch("/:id", updateGemCategoryGroup, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            body: t.Object({
                name: t.String({
                    minLength: 1,
                    maxLength: 255,
                    error: "Group name is required",
                }),
            }),
            detail: {
                tags: ["Gem Category Groups"],
                summary: "Update GEM category group",
            },
        })
        .delete("/:id", deleteGemCategoryGroup, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Gem Category Groups"],
                summary: "Delete GEM category group (and its categories)",
            },
        });
}
