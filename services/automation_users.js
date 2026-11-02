import {
    createAutomationUser,
    deleteAutomationUserById,
    getAllAutomationUsers,
    getAutomationUserById,
    getAutomationUserByName,
    updateAutomationUserById,
} from "../db/automation_users.js";

function normalizeCookie(value) {
    const cookie = String(value || "").trim();
    return cookie || null;
}

function hasAnyCookie({ facebook_cookie, instagram_cookie, youtube_cookie, linkedin_cookie }) {
    return Boolean(facebook_cookie || instagram_cookie || youtube_cookie || linkedin_cookie);
}

export async function addAutomationUser({ body, set }) {
    const name = body.name.trim();
    const facebook_cookie = normalizeCookie(body.facebook_cookie);
    const instagram_cookie = normalizeCookie(body.instagram_cookie);
    const youtube_cookie = normalizeCookie(body.youtube_cookie);
    const linkedin_cookie = normalizeCookie(body.linkedin_cookie);

    if (!name) {
        set.status = 400;
        return { error: "Name is required" };
    }
    if (!hasAnyCookie({ facebook_cookie, instagram_cookie, youtube_cookie, linkedin_cookie })) {
        set.status = 400;
        return { error: "At least one platform cookie is required" };
    }

    const existingUser = await getAutomationUserByName({ name });
    if (existingUser) {
        set.status = 409;
        return { error: "Automation user already exists" };
    }

    const id = await createAutomationUser({
        name,
        facebook_cookie,
        instagram_cookie,
        youtube_cookie,
        linkedin_cookie,
    });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create automation user" };
    }

    const automationUser = await getAutomationUserById({ id });
    set.status = 201;
    return { message: "Automation user created", automationUser };
}

export async function updateAutomationUser({ params, body, set }) {
    const existingUser = await getAutomationUserById({ id: params.id });
    if (!existingUser) {
        set.status = 404;
        return { error: "Automation user not found" };
    }

    const name = body.name.trim();
    const facebook_cookie = normalizeCookie(body.facebook_cookie);
    const instagram_cookie = normalizeCookie(body.instagram_cookie);
    const youtube_cookie = normalizeCookie(body.youtube_cookie);
    const linkedin_cookie = normalizeCookie(body.linkedin_cookie);

    if (!name) {
        set.status = 400;
        return { error: "Name is required" };
    }
    if (!hasAnyCookie({ facebook_cookie, instagram_cookie, youtube_cookie, linkedin_cookie })) {
        set.status = 400;
        return { error: "At least one platform cookie is required" };
    }

    const duplicateUser = await getAutomationUserByName({ name });
    if (duplicateUser && Number(duplicateUser.id) !== Number(existingUser.id)) {
        set.status = 409;
        return { error: "Automation user already exists" };
    }

    await updateAutomationUserById({
        id: existingUser.id,
        name,
        facebook_cookie,
        instagram_cookie,
        youtube_cookie,
        linkedin_cookie,
    });

    const automationUser = await getAutomationUserById({ id: existingUser.id });
    set.status = 200;
    return { message: "Automation user updated", automationUser };
}

export async function deleteAutomationUser({ params, set }) {
    const existingUser = await getAutomationUserById({ id: params.id });
    if (!existingUser) {
        set.status = 404;
        return { error: "Automation user not found" };
    }

    await deleteAutomationUserById({ id: existingUser.id });
    set.status = 204;
}

export async function getAutomationUsers({ set }) {
    const automationUsers = await getAllAutomationUsers();
    set.status = 200;
    return { automationUsers };
}
