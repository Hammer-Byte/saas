import { t } from "elysia";
import {
    addRole,
    deleteRole,
    getRoleAuthorities,
    getRoles,
    updateRole,
} from "../../services/roles.js";

export default function (app) {
    return app
        .get("/", getRoles, {
            detail: {
                tags: ["Roles"],
                summary: "List roles",
            },
        })
        .post("/", addRole, {
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 36,
                    error: "Role title is required",
                }),
                active: t.Optional(t.Boolean()),
            }),
            detail: {
                tags: ["Roles"],
                summary: "Create role",
            },
        })
        .patch("/:id", updateRole, {
            params: t.Object({
                id: t.Numeric(),
            }),
            body: t.Object({
                title: t.String({
                    minLength: 1,
                    maxLength: 36,
                    error: "Role title is required",
                }),
                active: t.Boolean(),
            }),
            detail: {
                tags: ["Roles"],
                summary: "Update role",
            },
        })
        .delete("/:id", deleteRole, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Roles"],
                summary: "Delete role",
            },
        })
        .get("/:id/authorities", getRoleAuthorities, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Roles"],
                summary: "List authorities for a role",
            },
        });
}
