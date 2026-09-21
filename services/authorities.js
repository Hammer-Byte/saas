import {
    createAuthority,
    deleteAuthorityById,
    getAllAuthorities,
    getAuthorityById,
    getAuthorityByTitle,
} from "../db/authorities.js";
import { getRoleByTitle } from "../db/roles.js";
import { createRoleAuthority } from "../db/role_authorities.js";

export async function getAuthorities({ set }) {
    const authorities = await getAllAuthorities();
    set.status = 200;
    return { authorities };
}

export async function addAuthority({ body, set }) {
    const title = body.title.trim().toUpperCase();
    const description = body.description.trim();
    if (!title) {
        set.status = 400;
        return { error: "Authority title is required" };
    }
    if (!description) {
        set.status = 400;
        return { error: "Authority description is required" };
    }

    const existing = await getAuthorityByTitle({ title });
    if (existing) {
        set.status = 409;
        return { error: "Authority already exists" };
    }

    const id = await createAuthority({ title, description });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create authority" };
    }

    const adminRole = await getRoleByTitle({ title: "ADMIN" });
    if (adminRole) {
        await createRoleAuthority({
            role_id: adminRole.id,
            authority_id: id,
        });
    }

    const authority = await getAuthorityById({ id });
    set.status = 201;
    return { message: "Authority created", authority };
}

export async function deleteAuthority({ params, set }) {
    const existing = await getAuthorityById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Authority not found" };
    }

    await deleteAuthorityById({ id: existing.id });
    set.status = 204;
}
