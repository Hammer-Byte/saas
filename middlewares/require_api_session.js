import { getSession, SESSION_COOKIE } from "../libs/session.js";
import { ERRORS } from "../constants.js";

export default function requireApiSession({ cookie, set }) {
    const session = getSession(cookie[SESSION_COOKIE]?.value);

    if (!session) {
        set.status = 401;
        return { error: ERRORS.UNAUTHORIZED };
    }
}
