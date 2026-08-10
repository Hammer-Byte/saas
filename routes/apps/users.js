import { t } from "elysia";
import { addUser, deleteUser, updateUser } from "../../services/users.js";

export default function (app) {
    return app
        .post("/", addUser, {
            body: t.Object({
                full_name: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Full name is required",
                }),
                email: t.String({
                    minLength: 3,
                    maxLength: 48,
                    format: "email",
                    error: "Valid email is required",
                }),
            }),
            detail: {
                tags: ["Users"],
                summary: "Create user",
            },
        })
        .patch("/", updateUser, {
            body: t.Object({
                id: t.Numeric({ minimum: 1 }),
                full_name: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Full name is required",
                }),
                email: t.String({
                    minLength: 3,
                    maxLength: 48,
                    format: "email",
                    error: "Valid email is required",
                }),
            }),
            detail: {
                tags: ["Users"],
                summary: "Update user",
            },
        })
        .delete("/:id", deleteUser, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Users"],
                summary: "Delete user",
            },
        });
}
