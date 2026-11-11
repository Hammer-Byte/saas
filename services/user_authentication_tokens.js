import { filer, logger } from "@hammerbyte/utils";
import { ERRORS, USER_LOGIN_METHODS } from "../constants.js";
import { getUserByEmail, getUserById } from "../db/users.js";
import {
    createUserAuthenticationToken,
    getUserAuthenticationTokenByTokenAndOtp,
    updateUserAuthenticationTokenActiveById,
} from "../db/user_authentication_tokens.js";
import { generateAuthenticationToken, generateOTP } from "../libs/utils.js";
import { setAuthenticationTokenCookie } from "../libs/authentication.js";
import transporter from "../libs/transporter.js";

export async function addUserAuthenticationToken({ body, set }) {
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

    const loginMethod = user.login_method || USER_LOGIN_METHODS.OTP;
    if (loginMethod === USER_LOGIN_METHODS.PASSWORD) {
        set.status = 403;
        return { error: ERRORS.LOGIN_METHOD_NOT_ALLOWED };
    }

    const token = generateAuthenticationToken();
    const otp = generateOTP();

    await createUserAuthenticationToken({
        user_id: user.id,
        token,
        otp,
    });

    const html = filer.prepareTemplated("templates/otp.html", {
        otp,
        valid_for_minutes: 10,
        app_name: "HammerByte",
    });

    transporter.transport({
        recipient: email,
        subject: "OTP for your account",
        body: html,
        html_enabled: true,
    });

    logger.info(`OTP email queued for ${email}`);

    set.status = 201;
    return { authentication_token: token };
}

export async function updateUserAuthenticationToken({ body, cookie, set }) {
    const token = body.authentication_token.trim();
    const otp = body.otp.trim();

    const existingUserAuthenticationToken = await getUserAuthenticationTokenByTokenAndOtp({
        token,
        otp,
    });
    if (!existingUserAuthenticationToken) {
        set.status = 401;
        return { error: ERRORS.INVALID_OTP };
    }

    const user = await getUserById({ id: existingUserAuthenticationToken.user_id });
    if (!user || !user.login_active) {
        set.status = 403;
        return { error: ERRORS.LOGIN_BLOCKED };
    }

    await updateUserAuthenticationTokenActiveById({
        id: existingUserAuthenticationToken.id,
        active: true,
    });
    setAuthenticationTokenCookie(cookie, existingUserAuthenticationToken.token);

    set.status = 200;
    return {
        message: "Login successful",
        redirect: "/app",
    };
}
