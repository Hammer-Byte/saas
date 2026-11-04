import { t } from "elysia";
import {
    getLoginMethod,
    loginWithPassword,
    logout,
} from "../../services/authentication.js";

export default function (app) {
    return app
        .post("/logout", logout, {
            detail: {
                tags: ["Authentication"],
                summary: "Clear authentication token cookie and logout",
            },
        })
        .post("/login-method", getLoginMethod, {
            body: t.Object({
                email: t.String({
                    minLength: 3,
                    maxLength: 48,
                    format: "email",
                }),
            }),
            detail: {
                tags: ["Authentication"],
                summary: "Resolve login method for an email",
            },
        })
        .post("/login", loginWithPassword, {
            body: t.Object({
                email: t.String({
                    minLength: 3,
                    maxLength: 48,
                    format: "email",
                }),
                password: t.String({ minLength: 1, maxLength: 128 }),
            }),
            detail: {
                tags: ["Authentication"],
                summary: "Login with email and password",
            },
        });
}
