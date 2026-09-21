import { getRoleById } from "../db/roles.js";
import { getUserById } from "../db/users.js";
import {
    createUserRole,
    deleteUserRoleById,
    getUserRoleByUserAndRole,
    getUserRolesByUserId,
} from "../db/user_roles.js";

export async function getUserRoles({ params, set }) {
    const user = await getUserById({ id: params.id });
    if (!user) {
        set.status = 404;
        return { error: "User not found" };
    }

    const userRoles = await getUserRolesByUserId({ user_id: user.id });
    set.status = 200;
    return { user, userRoles };
}

export async function addUserRole({ body, set }) {
    const user = await getUserById({ id: body.user_id });
    if (!user) {
        set.status = 404;
        return { error: "User not found" };
    }

    const role = await getRoleById({ id: body.role_id });
    if (!role) {
        set.status = 404;
        return { error: "Role not found" };
    }

    const existing = await getUserRoleByUserAndRole({
        user_id: user.id,
        role_id: role.id,
    });
    if (existing) {
        set.status = 409;
        return { error: "User already has this role" };
    }

    const id = await createUserRole({
        user_id: user.id,
        role_id: role.id,
    });
    if (!id) {
        set.status = 400;
        return { error: "Failed to assign role" };
    }

    set.status = 201;
    return {
        message: "Role assigned to user",
        userRole: { id, user_id: user.id, role_id: role.id },
    };
}

export async function deleteUserRole({ params, set }) {
    await deleteUserRoleById({ id: params.id });
    set.status = 204;
}
