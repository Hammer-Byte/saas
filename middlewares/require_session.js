import { getSession, SESSION_COOKIE } from "../libs/session.js";

export default function requireSession({ cookie, redirect }) {
    const session = getSession(cookie[SESSION_COOKIE]?.value);

    if (!session) {
        return redirect("/login");
    }
}
