import { t } from "elysia";
import { addUserRole, deleteUserRole } from "../../services/user_roles.js";

export default function (app) {
    return app
        .post("/", addUserRole, {
            body: t.Object({
                user_id: t.Numeric({ minimum: 1 }),
                role_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["User Roles"],
                summary: "Assign role to user",
            },
        })
        .delete("/:id", deleteUserRole, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["User Roles"],
                summary: "Remove role from user",
            },
        });
}
