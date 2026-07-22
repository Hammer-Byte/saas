import {
    createSession,
    destroySession,
    getSession,
    SESSION_COOKIE,
    SESSION_MAX_AGE_SECONDS,
} from "../libs/session.js";
import { ERRORS } from "../constants.js";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "1234";

function setSessionCookie(cookie, sessionId) {
    cookie[SESSION_COOKIE].set({
        value: sessionId,
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE_SECONDS,
    });
}

function clearSessionCookie(cookie) {
    cookie[SESSION_COOKIE].set({
        value: "",
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: 0,
    });
}

export async function login({ body, cookie, set }) {
    const username = body.username?.trim();
    const password = body.password;

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        set.status = 401;
        return { error: ERRORS.INVALID_CREDENTIALS };
    }

    const existingId = cookie[SESSION_COOKIE]?.value;
    if (existingId) {
        destroySession(existingId);
    }

    const sessionId = createSession({ username: ADMIN_USERNAME });
    setSessionCookie(cookie, sessionId);

    set.status = 200;
    return {
        message: "Login successful",
        redirect: "/app",
    };
}

export async function logout({ cookie, set }) {
    const sessionId = cookie[SESSION_COOKIE]?.value;
    if (sessionId) {
        destroySession(sessionId);
    }
    clearSessionCookie(cookie);

    set.status = 200;
    return {
        message: "Logged out",
        redirect: "/login",
    };
}

export function getCurrentSession({ cookie }) {
    const sessionId = cookie[SESSION_COOKIE]?.value;
    return getSession(sessionId);
}
