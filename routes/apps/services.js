import { t } from "elysia";
import { addService, deleteService, updateService } from "../../services/services.js";

export default function (app) {
    return app
        .post("/", addService, {
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 56,
                    error: "Title is required",
                }),
                description: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Description is required",
                }),
                cost: t.Numeric({ minimum: 0 }),
            }),
            detail: {
                tags: ["Services"],
                summary: "Create service",
            },
        })
        .patch("/", updateService, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                title: t.String({
                    minLength: 1,
                    maxLength: 56,
                    error: "Title is required",
                }),
                description: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Description is required",
                }),
                cost: t.Numeric({ minimum: 0 }),
            }),
            detail: {
                tags: ["Services"],
                summary: "Update service",
            },
        })
        .delete("/:id", deleteService, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Services"],
                summary: "Delete service",
            },
        });
}
