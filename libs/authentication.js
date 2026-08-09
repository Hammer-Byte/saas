export const AUTHENTICATION_TOKEN_COOKIE = "authentication_token";
export const AUTHENTICATION_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

export function setAuthenticationTokenCookie(cookie, token) {
    cookie[AUTHENTICATION_TOKEN_COOKIE].set({
        value: token,
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: AUTHENTICATION_TOKEN_MAX_AGE_SECONDS,
    });
}

export function clearAuthenticationTokenCookie(cookie) {
    cookie[AUTHENTICATION_TOKEN_COOKIE].set({
        value: "",
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: 0,
    });
}
