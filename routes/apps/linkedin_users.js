import { t } from "elysia";
import {
    addLinkedinUser,
    deleteLinkedinUser,
    getLinkedinUsers,
    updateLinkedinUser,
} from "../../services/linkedin_users.js";

export default function (app) {
    return app
        .get("/", getLinkedinUsers, {
            detail: {
                tags: ["LinkedIn Users"],
                summary: "List LinkedIn users",
            },
        })
        .post("/", addLinkedinUser, {
            body: t.Object({
                name: t.String({
                    minLength: 1,
                    maxLength: 255,
                    error: "Name is required",
                }),
                cookie: t.String({
                    minLength: 1,
                    error: "Cookie is required",
                }),
            }),
            detail: {
                tags: ["LinkedIn Users"],
                summary: "Create LinkedIn user",
            },
        })
        .patch("/:id", updateLinkedinUser, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                name: t.String({
                    minLength: 1,
                    maxLength: 255,
                    error: "Name is required",
                }),
                cookie: t.String({
                    minLength: 1,
                    error: "Cookie is required",
                }),
            }),
            detail: {
                tags: ["LinkedIn Users"],
                summary: "Update LinkedIn user",
            },
        })
        .delete("/:id", deleteLinkedinUser, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["LinkedIn Users"],
                summary: "Delete LinkedIn user",
            },
        });
}
