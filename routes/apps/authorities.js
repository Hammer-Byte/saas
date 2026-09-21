import { t } from "elysia";
import { addAuthority, deleteAuthority, getAuthorities } from "../../services/authorities.js";

export default function (app) {
    return app
        .get("/", getAuthorities, {
            detail: {
                tags: ["Authorities"],
                summary: "List authorities",
            },
        })
        .post("/", addAuthority, {
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 72,
                    error: "Authority title is required",
                }),
                description: t.String({
                    minLength: 1,
                    maxLength: 128,
                    error: "Authority description is required",
                }),
            }),
            detail: {
                tags: ["Authorities"],
                summary: "Create authority",
            },
        })
        .delete("/:id", deleteAuthority, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Authorities"],
                summary: "Delete authority",
            },
        });
}
