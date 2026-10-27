import {
    createLinkedinUser,
    deleteLinkedinUserById,
    getAllLinkedinUsers,
    getLinkedinUserById,
    getLinkedinUserByName,
    updateLinkedinUserById,
} from "../db/linkedin_users.js";

export async function addLinkedinUser({ body, set }) {
    const name = body.name.trim();
    const cookie = body.cookie.trim();

    if (!name) {
        set.status = 400;
        return { error: "Name is required" };
    }
    if (!cookie) {
        set.status = 400;
        return { error: "Cookie is required" };
    }

    const existingUser = await getLinkedinUserByName({ name });
    if (existingUser) {
        set.status = 409;
        return { error: "LinkedIn user already exists" };
    }

    const id = await createLinkedinUser({ name, cookie });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create LinkedIn user" };
    }

    const linkedinUser = await getLinkedinUserById({ id });
    set.status = 201;
    return { message: "LinkedIn user created", linkedinUser };
}

export async function updateLinkedinUser({ params, body, set }) {
    const existingUser = await getLinkedinUserById({ id: params.id });
    if (!existingUser) {
        set.status = 404;
        return { error: "LinkedIn user not found" };
    }

    const name = body.name.trim();
    const cookie = body.cookie.trim();

    if (!name) {
        set.status = 400;
        return { error: "Name is required" };
    }
    if (!cookie) {
        set.status = 400;
        return { error: "Cookie is required" };
    }

    const duplicateUser = await getLinkedinUserByName({ name });
    if (duplicateUser && Number(duplicateUser.id) !== Number(existingUser.id)) {
        set.status = 409;
        return { error: "LinkedIn user already exists" };
    }

    await updateLinkedinUserById({
        id: existingUser.id,
        name,
        cookie,
    });

    const linkedinUser = await getLinkedinUserById({ id: existingUser.id });
    set.status = 200;
    return { message: "LinkedIn user updated", linkedinUser };
}

export async function deleteLinkedinUser({ params, set }) {
    const existingUser = await getLinkedinUserById({ id: params.id });
    if (!existingUser) {
        set.status = 404;
        return { error: "LinkedIn user not found" };
    }

    await deleteLinkedinUserById({ id: existingUser.id });
    set.status = 204;
}

export async function getLinkedinUsers({ set }) {
    const linkedinUsers = await getAllLinkedinUsers();
    set.status = 200;
    return { linkedinUsers };
}
