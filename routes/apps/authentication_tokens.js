import { t } from "elysia";
import {
    addAuthenticationToken,
    updateAuthenticationToken,
} from "../../services/authentication_tokens.js";

export default function (app) {
    return app
        .post("/", addAuthenticationToken, {
            body: t.Object({
                email: t.String({
                    format: "email",
                    minLength: 1,
                    maxLength: 48,
                    error: "Email is required",
                }),
            }),
            detail: {
                tags: ["Authentication Tokens"],
                summary: "Create authentication token and OTP for email",
            },
        })
        .patch("/", updateAuthenticationToken, {
            body: t.Object({
                authentication_token: t.String({
                    minLength: 32,
                    maxLength: 32,
                    error: "Authentication token is required",
                }),
                otp: t.String({
                    minLength: 4,
                    maxLength: 4,
                    error: "OTP is required",
                }),
            }),
            detail: {
                tags: ["Authentication Tokens"],
                summary: "Verify OTP and activate authentication token",
            },
        });
}
