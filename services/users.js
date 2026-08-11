import {
    createUser,
    deleteUserById,
    getUserByEmail,
    getUserById,
    updateUserById,
} from "../db/users.js";

export async function addUser({ body, set }) {
    const email = body.email.trim().toLowerCase();
    const existing = await getUserByEmail({ email });
    if (existing) {
        set.status = 409;
        return { error: "A user with this email already exists" };
    }

    const id = await createUser({
        ...body,
        full_name: body.full_name.trim(),
        email,
    });

    const user = await getUserById({ id });

    set.status = 201;
    return { message: "User created", user };
}

export async function updateUser({ body, set }) {
    const existing = await getUserById({ id: body.id });
    if (!existing) {
        set.status = 404;
        return { error: "User not found" };
    }

    const email = body.email.trim().toLowerCase();
    const emailOwner = await getUserByEmail({ email });
    if (emailOwner && emailOwner.id !== body.id) {
        set.status = 409;
        return { error: "A user with this email already exists" };
    }

    await updateUserById({
        ...body,
        full_name: body.full_name.trim(),
        email,
    });

    const user = await getUserById({ id: body.id });

    set.status = 200;
    return { message: "User updated", user };
}

export async function deleteUser({ params, set }) {
    const existing = await getUserById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "User not found" };
    }

    await deleteUserById({ id: params.id });
    set.status = 204;
}
