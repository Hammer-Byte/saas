import { getAuthorityById } from "../db/authorities.js";
import { getRoleById } from "../db/roles.js";
import {
    createRoleAuthority,
    deleteRoleAuthorityById,
    getRoleAuthorityByRoleAndAuthority,
} from "../db/role_authorities.js";

export async function addRoleAuthority({ body, set }) {
    const role = await getRoleById({ id: body.role_id });
    if (!role) {
        set.status = 404;
        return { error: "Role not found" };
    }

    const authority = await getAuthorityById({ id: body.authority_id });
    if (!authority) {
        set.status = 404;
        return { error: "Authority not found" };
    }

    const existing = await getRoleAuthorityByRoleAndAuthority({
        role_id: role.id,
        authority_id: authority.id,
    });
    if (existing) {
        set.status = 409;
        return { error: "Role already has this authority" };
    }

    const id = await createRoleAuthority({
        role_id: role.id,
        authority_id: authority.id,
    });
    if (!id) {
        set.status = 400;
        return { error: "Failed to assign authority" };
    }

    set.status = 201;
    return {
        message: "Authority assigned to role",
        roleAuthority: { id, role_id: role.id, authority_id: authority.id },
    };
}

export async function deleteRoleAuthority({ params, set }) {
    await deleteRoleAuthorityById({ id: params.id });
    set.status = 204;
}
