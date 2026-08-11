import { filer, logger } from "@hammerbyte/utils";
import { getUserByEmail } from "../db/users.js";
import {
    createUserAuthenticationToken,
    getUserAuthenticationTokenByTokenAndOtp,
    updateUserAuthenticationTokenActiveById,
} from "../db/user_authentication_tokens.js";
import { generateAuthenticationToken, generateOTP } from "../libs/utils.js";
import { setAuthenticationTokenCookie } from "../libs/authentication.js";
import transporter from "../libs/transporter.js";
import { ERRORS } from "../constants.js";

export async function addAuthenticationToken({ body, set }) {
    const email = body.email.trim().toLowerCase();
    const user = await getUserByEmail({ email });

    if (!user) {
        set.status = 404;
        return { error: ERRORS.NO_SUCH_USER };
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

export async function updateAuthenticationToken({ body, cookie, set }) {
    const token = body.authentication_token.trim();
    const otp = body.otp.trim();

    const existing = await getUserAuthenticationTokenByTokenAndOtp({ token, otp });
    if (!existing) {
        set.status = 401;
        return { error: ERRORS.INVALID_OTP };
    }

    await updateUserAuthenticationTokenActiveById({ id: existing.id, active: true });
    setAuthenticationTokenCookie(cookie, existing.token);

    set.status = 200;
    return {
        message: "Login successful",
        redirect: "/app",
    };
}
