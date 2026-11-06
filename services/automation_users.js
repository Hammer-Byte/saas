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

function normalizeYoutubeChannelId(value) {
    const text = String(value || "").trim();
    if (!text) {
        return null;
    }
    const fromUrl = text.match(/channel\/(UC[\w-]+)/i);
    if (fromUrl) {
        return fromUrl[1];
    }
    if (/^UC[\w-]+$/i.test(text)) {
        return text;
    }
    return null;
}

function normalizeLinkedinCompanyId(value) {
    const text = String(value || "").trim();
    if (!text) {
        return null;
    }
    const fromUrl = text.match(/company\/(\d+)(?:\/|$)/i);
    if (fromUrl) {
        return fromUrl[1];
    }
    if (/^\d+$/.test(text)) {
        return text;
    }
    return null;
}

/** Instagram professional account id (numeric), optionally from Graph URLs. */
function normalizeInstagramUserId(value) {
    const text = String(value || "").trim();
    if (!text) {
        return null;
    }
    if (/^\d{5,}$/.test(text)) {
        return text;
    }
    const fromQuery = text.match(/[?&](?:ig_user_id|instagram_business_account)(?:=|%3D)(\d+)/i);
    if (fromQuery) {
        return fromQuery[1];
    }
    const digits = text.match(/\b(\d{5,})\b/);
    return digits ? digits[1] : null;
}

function hasAnyCredential({ facebook_cookie, instagram_cookie, youtube_cookie, linkedin_cookie }) {
    return Boolean(facebook_cookie || instagram_cookie || youtube_cookie || linkedin_cookie);
}

export async function addAutomationUser({ body, set }) {
    const name = body.name.trim();
    const facebook_cookie = normalizeCookie(body.facebook_cookie);
    const instagram_cookie = normalizeCookie(body.instagram_cookie);
    const instagram_user_id = normalizeInstagramUserId(body.instagram_user_id);
    const youtube_cookie = normalizeCookie(body.youtube_cookie);
    const youtube_channel_id = normalizeYoutubeChannelId(body.youtube_channel_id);
    const linkedin_cookie = normalizeCookie(body.linkedin_cookie);
    const linkedin_company_id = normalizeLinkedinCompanyId(body.linkedin_company_id);

    if (!name) {
        set.status = 400;
        return { error: "Name is required" };
    }
    if (!hasAnyCredential({ facebook_cookie, instagram_cookie, youtube_cookie, linkedin_cookie })) {
        set.status = 400;
        return { error: "At least one platform credential is required" };
    }
    if (instagram_cookie && !instagram_user_id) {
        set.status = 400;
        return {
            error: "Instagram user id is required when an Instagram access token is set",
        };
    }
    if (youtube_cookie && !youtube_channel_id) {
        set.status = 400;
        return {
            error: "YouTube channel id (UC… or channel URL) is required when a YouTube cookie is set",
        };
    }
    if (linkedin_cookie && !linkedin_company_id) {
        set.status = 400;
        return {
            error: "LinkedIn page / company id is required when a LinkedIn cookie is set",
        };
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
        instagram_user_id,
        youtube_cookie,
        youtube_channel_id,
        linkedin_cookie,
        linkedin_company_id,
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
    const instagram_user_id = normalizeInstagramUserId(body.instagram_user_id);
    const youtube_cookie = normalizeCookie(body.youtube_cookie);
    const youtube_channel_id = normalizeYoutubeChannelId(body.youtube_channel_id);
    const linkedin_cookie = normalizeCookie(body.linkedin_cookie);
    const linkedin_company_id = normalizeLinkedinCompanyId(body.linkedin_company_id);

    if (!name) {
        set.status = 400;
        return { error: "Name is required" };
    }
    if (!hasAnyCredential({ facebook_cookie, instagram_cookie, youtube_cookie, linkedin_cookie })) {
        set.status = 400;
        return { error: "At least one platform credential is required" };
    }
    if (instagram_cookie && !instagram_user_id) {
        set.status = 400;
        return {
            error: "Instagram user id is required when an Instagram access token is set",
        };
    }
    if (youtube_cookie && !youtube_channel_id) {
        set.status = 400;
        return {
            error: "YouTube channel id (UC… or channel URL) is required when a YouTube cookie is set",
        };
    }
    if (linkedin_cookie && !linkedin_company_id) {
        set.status = 400;
        return {
            error: "LinkedIn page / company id is required when a LinkedIn cookie is set",
        };
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
        instagram_user_id,
        youtube_cookie,
        youtube_channel_id,
        linkedin_cookie,
        linkedin_company_id,
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
