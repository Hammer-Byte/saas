import { ERRORS, USER_LOGIN_METHODS } from "../constants.js";
import { getUserByEmail } from "../db/users.js";
import {
    createUserAuthenticationToken,
    getActiveUserAuthenticationTokenByToken,
    updateUserAuthenticationTokenActiveById,
} from "../db/user_authentication_tokens.js";
import { getAuthorityTitlesByRoleIds } from "../db/role_authorities.js";
import { getUserRolesByUserId } from "../db/user_roles.js";
import {
    AUTHENTICATION_TOKEN_COOKIE,
    clearAuthenticationTokenCookie,
    setAuthenticationTokenCookie,
} from "../libs/authentication.js";
import { generateAuthenticationToken, generateOTP } from "../libs/utils.js";

export async function getCurrentUser({ cookie }) {
    const token = cookie[AUTHENTICATION_TOKEN_COOKIE]?.value;
    if (!token) {
        return null;
    }

    const authenticationToken = await getActiveUserAuthenticationTokenByToken({ token });
    if (!authenticationToken) {
        return null;
    }

    const userRoles = await getUserRolesByUserId({ user_id: authenticationToken.user_id });
    const activeRoles = userRoles.filter((role) => !!role.active);
    const roles = activeRoles.map((role) => role.title);
    const authorities = await getAuthorityTitlesByRoleIds({
        roleIds: activeRoles.map((role) => role.role_id),
    });

    return {
        id: authenticationToken.user_id,
        email: authenticationToken.email,
        full_name: authenticationToken.full_name,
        username: authenticationToken.full_name || authenticationToken.email,
        super_admin: !!authenticationToken.super_admin,
        authentication_token: authenticationToken.token,
        roles,
        authorities,
    };
}

export async function logout({ cookie, set }) {
    const token = cookie[AUTHENTICATION_TOKEN_COOKIE]?.value;
    if (token) {
        const existingAuthenticationToken = await getActiveUserAuthenticationTokenByToken({
            token,
        });
        if (existingAuthenticationToken) {
            await updateUserAuthenticationTokenActiveById({
                id: existingAuthenticationToken.id,
                active: false,
            });
        }
    }

    clearAuthenticationTokenCookie(cookie);

    set.status = 200;
    return {
        message: "Logged out",
        redirect: "/login",
    };
}

export async function getLoginMethod({ body, set }) {
    const email = body.email.trim().toLowerCase();
    const user = await getUserByEmail({ email });
    if (!user) {
        set.status = 404;
        return { error: ERRORS.NO_SUCH_USER };
    }

    if (!user.login_active) {
        set.status = 403;
        return { error: ERRORS.LOGIN_BLOCKED };
    }

    set.status = 200;
    return {
        login_method: user.login_method || USER_LOGIN_METHODS.OTP,
    };
}

export async function loginWithPassword({ body, cookie, set }) {
    const email = body.email.trim().toLowerCase();
    const password = String(body.password || "");
    const user = await getUserByEmail({ email });

    if (!user) {
        set.status = 401;
        return { error: ERRORS.INVALID_PASSWORD };
    }

    if (!user.login_active) {
        set.status = 403;
        return { error: ERRORS.LOGIN_BLOCKED };
    }

    const loginMethod = user.login_method || USER_LOGIN_METHODS.OTP;
    if (loginMethod === USER_LOGIN_METHODS.OTP) {
        set.status = 403;
        return { error: ERRORS.LOGIN_METHOD_NOT_ALLOWED };
    }

    if (!user.password_hash) {
        set.status = 401;
        return { error: ERRORS.INVALID_PASSWORD };
    }

    const passwordMatches = await Bun.password.verify(password, user.password_hash);
    if (!passwordMatches) {
        set.status = 401;
        return { error: ERRORS.INVALID_PASSWORD };
    }

    const token = generateAuthenticationToken();
    const otp = generateOTP();
    const tokenId = await createUserAuthenticationToken({
        user_id: user.id,
        token,
        otp,
    });
    if (!tokenId) {
        set.status = 400;
        return { error: "Failed to create session" };
    }

    await updateUserAuthenticationTokenActiveById({
        id: tokenId,
        active: true,
    });
    setAuthenticationTokenCookie(cookie, token);

    set.status = 200;
    return {
        message: "Login successful",
        redirect: "/app",
    };
}
