import { t } from "elysia";
import { login, logout } from "../../services/auth.js";
import { ERRORS } from "../../constants.js";

export default function (app) {
    return app
        .post("/login", login, {
            body: t.Object({
                username: t.String({
                    minLength: 1,
                    maxLength: 64,
                    error: ERRORS.USERNAME_REQUIRED,
                }),
                password: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: ERRORS.PASSWORD_REQUIRED,
                }),
            }),
            detail: {
                tags: ["Auth"],
                summary: "Login and create session",
            },
        })
        .post("/logout", logout, {
            detail: {
                tags: ["Auth"],
                summary: "Destroy session and logout",
            },
        });
}
