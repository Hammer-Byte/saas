import {
    createRole,
    deleteRoleById,
    getAllRoles,
    getRoleById,
    getRoleByTitle,
    updateRoleById,
} from "../db/roles.js";
import { getRoleAuthoritiesByRoleId } from "../db/role_authorities.js";
import { assignAllRolesToSuperAdmins } from "../db/user_roles.js";

export async function getRoles({ set }) {
    const roles = await getAllRoles();
    set.status = 200;
    return { roles };
}

export async function addRole({ body, set }) {
    const title = body.title.trim().toUpperCase();
    if (!title) {
        set.status = 400;
        return { error: "Role title is required" };
    }

    const existing = await getRoleByTitle({ title });
    if (existing) {
        set.status = 409;
        return { error: "Role already exists" };
    }

    const id = await createRole({ title, active: body.active !== false });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create role" };
    }

    await assignAllRolesToSuperAdmins();

    const role = await getRoleById({ id });
    set.status = 201;
    return { message: "Role created", role };
}

export async function updateRole({ params, body, set }) {
    const existing = await getRoleById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Role not found" };
    }

    const title = body.title.trim().toUpperCase();
    if (!title) {
        set.status = 400;
        return { error: "Role title is required" };
    }

    const duplicate = await getRoleByTitle({ title });
    if (duplicate && Number(duplicate.id) !== Number(existing.id)) {
        set.status = 409;
        return { error: "Role already exists" };
    }

    await updateRoleById({
        id: existing.id,
        title,
        active: !!body.active,
    });

    const role = await getRoleById({ id: existing.id });
    set.status = 200;
    return { message: "Role updated", role };
}

export async function deleteRole({ params, set }) {
    const existing = await getRoleById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Role not found" };
    }

    await deleteRoleById({ id: existing.id });
    set.status = 204;
}

export async function getRoleAuthorities({ params, set }) {
    const existing = await getRoleById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Role not found" };
    }

    const roleAuthorities = await getRoleAuthoritiesByRoleId({ role_id: existing.id });
    set.status = 200;
    return { role: existing, roleAuthorities };
}
