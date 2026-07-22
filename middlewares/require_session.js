import { getSession, SESSION_COOKIE } from "../libs/session.js";

export default function requireSession({ cookie, set }) {
    const sessionId = cookie[SESSION_COOKIE]?.value;
    const session = getSession(sessionId);

    if (!session) {
        set.redirect = "/login";
        return "Unauthorized";
    }
}
