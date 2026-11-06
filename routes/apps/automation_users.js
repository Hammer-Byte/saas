import { t } from "elysia";
import {
    addAutomationUser,
    deleteAutomationUser,
    getAutomationUsers,
    updateAutomationUser,
} from "../../services/automation_users.js";

const optionalCookie = t.Optional(t.String());

export default function (app) {
    return app
        .get("/", getAutomationUsers, {
            detail: {
                tags: ["Automation Users"],
                summary: "List automation users",
            },
        })
        .post("/", addAutomationUser, {
            body: t.Object({
                name: t.String({
                    minLength: 1,
                    maxLength: 255,
                    error: "Name is required",
                }),
                instagram_cookie: optionalCookie,
                instagram_user_id: optionalCookie,
                youtube_cookie: optionalCookie,
                youtube_channel_id: optionalCookie,
                linkedin_cookie: optionalCookie,
                linkedin_company_id: optionalCookie,
            }),
            detail: {
                tags: ["Automation Users"],
                summary: "Create automation user",
            },
        })
        .patch("/:id", updateAutomationUser, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                name: t.String({
                    minLength: 1,
                    maxLength: 255,
                    error: "Name is required",
                }),
                instagram_cookie: optionalCookie,
                instagram_user_id: optionalCookie,
                youtube_cookie: optionalCookie,
                youtube_channel_id: optionalCookie,
                linkedin_cookie: optionalCookie,
                linkedin_company_id: optionalCookie,
            }),
            detail: {
                tags: ["Automation Users"],
                summary: "Update automation user",
            },
        })
        .delete("/:id", deleteAutomationUser, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Automation Users"],
                summary: "Delete automation user",
            },
        });
}