import {
	activateAuthenticationTokenByToken,
	createAuthenticationToken,
	deleteAuthenticationTokenById,
	getAllAuthenticationTokens,
	getAuthenticationTokenById,
	getAuthenticationTokenByToken,
	getInactiveAuthenticationTokenByTokenAndOtp,
	updateAuthenticationTokenById,
} from "../entities/authentication_tokens.js";
import { getUserByEmail, getUserById } from "../entities/users.js";
import { AUTH_TOKEN_VALIDITY_MS, ERRORS } from "../constants.js";
import { generateOTP, generateToken } from "../util.js";

export async function getValidAuthenticationToken({ params, set }) {
	const authenticationToken = await getAuthenticationTokenByToken({
		token: params.authentication_token,
	});

	if (!authenticationToken) {
		set.status = 404;
		return { error: ERRORS.AUTHENTICATION_TOKEN_NOT_FOUND };
	}

	if (authenticationToken.active) {
		const user = await getUserById({ id: authenticationToken.user_id });
		if (!user) {
			set.status = 401;
			return { error: ERRORS.MISSING_INVALID_AUTHENTICATION_TOKEN };
		}

		set.status = 200;
		return { ...authenticationToken, user };
	}

	set.status = 401;
	return { error: ERRORS.MISSING_INVALID_AUTHENTICATION_TOKEN };
}

export async function requestAuthenticationToken({ body, set }) {
	const email = body.email.trim().toLowerCase();
	const user = await getUserByEmail({ email });

	if (!user) {
		set.status = 404;
		return { error: ERRORS.USER_NOT_FOUND };
	}

	const token = generateToken();
	const otp = generateOTP();

	await createAuthenticationToken({
		user_id: user.id,
		otp,
		token,
		active: false,
		validity: Date.now() + AUTH_TOKEN_VALIDITY_MS,
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
	return { authentication_token: token };
}

export async function verifyAuthenticationTokenOtp({ body, set }) {
	const authenticationToken = await getInactiveAuthenticationTokenByTokenAndOtp({
		token: body.authentication_token,
		otp: body.otp,
	});

	if (!authenticationToken) {
		set.status = 401;
		return { error: ERRORS.INVALID_OTP };
	}

	await activateAuthenticationTokenByToken({
		token: body.authentication_token,
		updated_by: authenticationToken.user_id,
	});

	const user = await getUserById({ id: authenticationToken.user_id });
	if (!user) {
		set.status = 401;
		return { error: ERRORS.INVALID_OTP };
	}

	set.status = 200;
	return user;
}

export async function getAuthenticationTokens({ set }) {
	const authenticationTokens = await getAllAuthenticationTokens();
	set.status = 200;
	return authenticationTokens;
}

export async function getAuthenticationToken({ params, set }) {
	const authenticationToken = await getAuthenticationTokenById(params);
	if (!authenticationToken) {
		set.status = 404;
		return { error: ERRORS.AUTHENTICATION_TOKEN_NOT_FOUND };
	}
	set.status = 200;
	return authenticationToken;
}

export async function updateAuthenticationToken({ params, body, user, set }) {
	const existingAuthenticationToken = await getAuthenticationTokenById(params);
	if (!existingAuthenticationToken) {
		set.status = 404;
		return { error: ERRORS.AUTHENTICATION_TOKEN_NOT_FOUND };
	}

	if (body.user_id) {
		const tokenUser = await getUserById({ id: body.user_id });
		if (!tokenUser) {
			set.status = 400;
			return { error: ERRORS.INVALID_USER };
		}
	}

	const authenticationTokenUpdate = { updated_by: user.id };

	if (body.user_id) {
		authenticationTokenUpdate.user_id = body.user_id;
	}
	if (body.token) {
		authenticationTokenUpdate.token = body.token.trim();
	}
	if (Object.hasOwn(body, "active")) {
		authenticationTokenUpdate.active = body.active;
	}
	if (body.validity) {
		authenticationTokenUpdate.validity = body.validity;
	}

	const authenticationToken = await updateAuthenticationTokenById({
		id: params.id,
		...authenticationTokenUpdate,
	});

	set.status = 200;
	return authenticationToken;
}

export async function deleteAuthenticationToken({ params, set }) {
	const existingAuthenticationToken = await getAuthenticationTokenById(params);
	if (!existingAuthenticationToken) {
		set.status = 404;
		return { error: ERRORS.AUTHENTICATION_TOKEN_NOT_FOUND };
	}

	deleteAuthenticationTokenById(params);
	set.status = 204;
	return;
}
