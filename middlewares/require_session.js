import { AUTHENTICATION_TOKEN_COOKIE } from "../libs/authentication.js";
import { getActiveUserAuthenticationTokenByToken } from "../db/user_authentication_tokens.js";

export default async function requireSession({ cookie, redirect }) {
    const token = cookie[AUTHENTICATION_TOKEN_COOKIE]?.value;
    if (!token) {
        return redirect("/login");
    }

    const authenticationToken = await getActiveUserAuthenticationTokenByToken({ token });
    if (!authenticationToken) {
        return redirect("/login");
    }
}
