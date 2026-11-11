import { ERRORS, USER_LOGIN_METHODS } from "../constants.js";
import {
    createUser,
    deleteUserById,
    getUserByEmail,
    getUserById,
    updateUserById,
    updateUserLoginActiveById,
} from "../db/users.js";
import { deactivateUserAuthenticationTokensByUserId } from "../db/user_authentication_tokens.js";

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

export async function createUserFromInput({
    full_name,
    email,
    personal_email,
    login_method,
    password,
    hourly_rate,
}) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.length > 48) {
        return { status: 400, error: "Valid email is required (max 48 characters)" };
    }

    const existingUser = await getUserByEmail({ email: normalizedEmail });
    if (existingUser) {
        return { status: 409, error: "A user with this email already exists" };
    }

    const loginMethod = normalizeLoginMethod(login_method);
    if (!loginMethod) {
        return { status: 400, error: "Invalid login method" };
    }

    const passwordValue = String(password || "").trim();
    let passwordHash = null;

    if (passwordRequiredForMethod(loginMethod)) {
        if (passwordValue.length < 8) {
            return { status: 400, error: "Password must be at least 8 characters" };
        }
        passwordHash = await Bun.password.hash(passwordValue);
    }

    const personalEmail = String(personal_email || "").trim().toLowerCase() || null;
    const hourlyRateResult = normalizeHourlyRate(hourly_rate);
    if (hourlyRateResult.error) {
        return { status: 400, error: hourlyRateResult.error };
    }

    const normalizedFullName = String(full_name || "").trim();
    if (!normalizedFullName) {
        return { status: 400, error: "Full name is required" };
    }

    const id = await createUser({
        full_name: normalizedFullName,
        email: normalizedEmail,
        personal_email: personalEmail,
        login_method: loginMethod,
        password_hash: passwordHash,
        hourly_rate: hourlyRateResult.rate,
    });
    if (!id) {
        return { status: 400, error: "Failed to create user" };
    }

    return {
        status: 201,
        user: sanitizeUser(await getUserById({ id })),
    };
}

export async function addUser({ body, set }) {
    const result = await createUserFromInput({
        full_name: body.full_name,
        email: body.email,
        personal_email: body.personal_email,
        login_method: body.login_method,
        password: body.password,
        hourly_rate: body.hourly_rate,
    });

    if (result.error) {
        set.status = result.status;
        return { error: result.error };
    }

    set.status = 201;
    return { message: "User created", user: result.user };
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

export async function updateUserLoginActive({ params, body, set }) {
    const existingUser = await getUserById({ id: params.id });
    if (!existingUser) {
        set.status = 404;
        return { error: "User not found" };
    }

    await updateUserLoginActiveById({
        id: existingUser.id,
        login_active: body.login_active,
    });

    if (!body.login_active) {
        await deactivateUserAuthenticationTokensByUserId({ user_id: existingUser.id });
    }

    const user = sanitizeUser(await getUserById({ id: existingUser.id }));

    set.status = 200;
    return {
        message: body.login_active ? "User login unblocked" : "User login blocked",
        user,
    };
}
