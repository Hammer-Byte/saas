import { ERRORS, USER_LOGIN_METHODS } from "../constants.js";
import {
    createUser,
    deleteUserById,
    getUserByEmail,
    getUserById,
    updateUserById,
} from "../db/users.js";

const LOGIN_METHOD_VALUES = new Set(Object.values(USER_LOGIN_METHODS));

function sanitizeUser(user) {
    if (!user) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
}

function normalizeLoginMethod(value) {
    const method = String(value || USER_LOGIN_METHODS.OTP).trim().toLowerCase();
    return LOGIN_METHOD_VALUES.has(method) ? method : null;
}

function passwordRequiredForMethod(loginMethod) {
    return (
        loginMethod === USER_LOGIN_METHODS.PASSWORD ||
        loginMethod === USER_LOGIN_METHODS.BOTH
    );
}

function normalizeHourlyRate(value) {
    if (value == null || value === "") {
        return { rate: null };
    }
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0) {
        return { error: "Hourly rate must be a non-negative number" };
    }
    return { rate: Math.round(rate * 100) / 100 };
}

export async function addUser({ body, set }) {
    const email = body.email.trim().toLowerCase();
    const existingUser = await getUserByEmail({ email });
    if (existingUser) {
        set.status = 409;
        return { error: "A user with this email already exists" };
    }

    const loginMethod = normalizeLoginMethod(body.login_method);
    if (!loginMethod) {
        set.status = 400;
        return { error: "Invalid login method" };
    }

    const password = String(body.password || "").trim();
    let passwordHash = null;

    if (passwordRequiredForMethod(loginMethod)) {
        if (password.length < 8) {
            set.status = 400;
            return { error: "Password must be at least 8 characters" };
        }
        passwordHash = await Bun.password.hash(password);
    }

    const personalEmail = String(body.personal_email || "").trim().toLowerCase() || null;
    const hourlyRateResult = normalizeHourlyRate(body.hourly_rate);
    if (hourlyRateResult.error) {
        set.status = 400;
        return { error: hourlyRateResult.error };
    }

    const id = await createUser({
        full_name: body.full_name.trim(),
        email,
        personal_email: personalEmail,
        login_method: loginMethod,
        password_hash: passwordHash,
        hourly_rate: hourlyRateResult.rate,
    });
    if (!id) {
        set.status = 400;
        return { error: "Failed to create user" };
    }

    const user = sanitizeUser(await getUserById({ id }));

    set.status = 201;
    return { message: "User created", user };
}

export async function updateUser({ body, set }) {
    const existingUser = await getUserById({ id: body.id });
    if (!existingUser) {
        set.status = 404;
        return { error: "User not found" };
    }

    const email = body.email.trim().toLowerCase();
    const emailOwner = await getUserByEmail({ email });
    if (emailOwner && emailOwner.id !== body.id) {
        set.status = 409;
        return { error: "A user with this email already exists" };
    }

    const loginMethod = normalizeLoginMethod(body.login_method);
    if (!loginMethod) {
        set.status = 400;
        return { error: "Invalid login method" };
    }

    const password = String(body.password || "").trim();
    const passwordProvided = password.length > 0;
    let passwordHash = existingUser.password_hash || null;
    let updatePassword = false;

    if (passwordProvided) {
        if (password.length < 8) {
            set.status = 400;
            return { error: "Password must be at least 8 characters" };
        }
        passwordHash = await Bun.password.hash(password);
        updatePassword = true;
    }

    if (passwordRequiredForMethod(loginMethod) && !passwordHash) {
        set.status = 400;
        return { error: ERRORS.PASSWORD_REQUIRED };
    }

    if (loginMethod === USER_LOGIN_METHODS.OTP && passwordHash) {
        passwordHash = null;
        updatePassword = true;
    }

    const personalEmail = String(body.personal_email || "").trim().toLowerCase() || null;
    const hourlyRateResult = normalizeHourlyRate(body.hourly_rate);
    if (hourlyRateResult.error) {
        set.status = 400;
        return { error: hourlyRateResult.error };
    }

    await updateUserById({
        id: existingUser.id,
        full_name: body.full_name.trim(),
        email,
        personal_email: personalEmail,
        login_method: loginMethod,
        password_hash: passwordHash,
        hourly_rate: hourlyRateResult.rate,
        update_password: updatePassword,
    });

    const user = sanitizeUser(await getUserById({ id: existingUser.id }));

    set.status = 200;
    return { message: "User updated", user };
}

export async function deleteUser({ params, set }) {
    const existingUser = await getUserById({ id: params.id });
    if (!existingUser) {
        set.status = 404;
        return { error: "User not found" };
    }

    await deleteUserById({ id: existingUser.id });
    set.status = 204;
}
