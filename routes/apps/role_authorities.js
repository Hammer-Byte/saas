import { t } from "elysia";
import { addRoleAuthority, deleteRoleAuthority } from "../../services/role_authorities.js";

export default function (app) {
    return app
        .post("/", addRoleAuthority, {
            body: t.Object({
                role_id: t.Numeric({ minimum: 1 }),
                authority_id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Role Authorities"],
                summary: "Assign authority to role",
            },
        })
        .delete("/:id", deleteRoleAuthority, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Role Authorities"],
                summary: "Remove authority from role",
            },
        });
}
