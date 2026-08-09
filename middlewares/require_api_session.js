import { AUTHENTICATION_TOKEN_COOKIE } from "../libs/authentication.js";
import { getActiveUserAuthenticationTokenByToken } from "../db/user_authentication_tokens.js";
import { ERRORS } from "../constants.js";

export default async function requireApiSession({ cookie, set }) {
    const token = cookie[AUTHENTICATION_TOKEN_COOKIE]?.value;
    if (!token) {
        set.status = 401;
        return { error: ERRORS.UNAUTHORIZED };
    }

    const auth = await getActiveUserAuthenticationTokenByToken({ token });
    if (!auth) {
        set.status = 401;
        return { error: ERRORS.UNAUTHORIZED };
    }
}
