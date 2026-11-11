import { t } from "elysia";
import { USER_LOGIN_METHODS } from "../../constants.js";
import { addUser, deleteUser, updateUser, updateUserLoginActive } from "../../services/users.js";
import { getUserRoles } from "../../services/user_roles.js";

const loginMethodSchema = t.Union([
    t.Literal(USER_LOGIN_METHODS.OTP),
    t.Literal(USER_LOGIN_METHODS.PASSWORD),
    t.Literal(USER_LOGIN_METHODS.BOTH),
]);

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
                personal_email: t.Optional(
                    t.Union([
                        t.String({ maxLength: 128 }),
                        t.Null(),
                    ]),
                ),
                login_method: loginMethodSchema,
                password: t.Optional(t.String({ maxLength: 128 })),
                hourly_rate: t.Optional(t.Union([t.Numeric({ minimum: 0 }), t.Null()])),
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
                personal_email: t.Optional(
                    t.Union([
                        t.String({ maxLength: 128 }),
                        t.Null(),
                    ]),
                ),
                login_method: loginMethodSchema,
                password: t.Optional(t.String({ maxLength: 128 })),
                hourly_rate: t.Optional(t.Union([t.Numeric({ minimum: 0 }), t.Null()])),
            }),
            detail: {
                tags: ["Users"],
                summary: "Update user",
            },
        })
        .get("/:id/roles", getUserRoles, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Users"],
                summary: "List roles for a user",
            },
        })
        .patch("/:id/login-active", updateUserLoginActive, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                login_active: t.Boolean(),
            }),
            detail: {
                tags: ["Users"],
                summary: "Block or unblock user login",
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
