import {
    clearAuthenticationTokenCookie,
    AUTHENTICATION_TOKEN_COOKIE,
} from "../libs/authentication.js";
import {
    getActiveUserAuthenticationTokenByToken,
    updateUserAuthenticationTokenActiveById,
} from "../db/user_authentication_tokens.js";

export async function logout({ cookie, set }) {
    const token = cookie[AUTHENTICATION_TOKEN_COOKIE]?.value;
    if (token) {
        const existing = await getActiveUserAuthenticationTokenByToken({ token });
        if (existing) {
            await updateUserAuthenticationTokenActiveById({ id: existing.id, active: false });
        }
    }

    clearAuthenticationTokenCookie(cookie);

    set.status = 200;
    return {
        message: "Logged out",
        redirect: "/login",
    };
}

export async function getCurrentUser({ cookie }) {
    const token = cookie[AUTHENTICATION_TOKEN_COOKIE]?.value;
    if (!token) {
        return null;
    }

    const auth = await getActiveUserAuthenticationTokenByToken({ token });
    if (!auth) {
        return null;
    }

    return {
        id: auth.user_id,
        email: auth.email,
        username: auth.email,
        authentication_token: auth.token,
    };
}
