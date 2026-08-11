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
        const existingAuthenticationToken = await getActiveUserAuthenticationTokenByToken({ token });
        if (existingAuthenticationToken) {
            await updateUserAuthenticationTokenActiveById({ id: existingAuthenticationToken.id, active: false });
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

    const authenticationToken = await getActiveUserAuthenticationTokenByToken({ token });
    if (!authenticationToken) {
        return null;
    }

    return {
        id: authenticationToken.user_id,
        email: authenticationToken.email,
        full_name: authenticationToken.full_name,
        username: authenticationToken.full_name || authenticationToken.email,
        authentication_token: authenticationToken.token,
    };
}
