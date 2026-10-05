import {
	createAuthenticationToken,
	deleteAuthenticationTokenById,
	getActiveAuthenticationTokenByToken,
	getAllAuthenticationTokens,
	getAuthenticationTokenById,
	updateAuthenticationTokenById,
} from "../entities/authentication_tokens.js";
import { getUserById } from "../entities/users.js";
import { ERRORS } from "../constants.js";

export async function getValidAuthenticationToken({ params, set }) {
	const authenticationToken = await getActiveAuthenticationTokenByToken({
		token: params.authentication_token,
	});

	if (!authenticationToken) {
		set.status = 401;
		return { error: ERRORS.MISSING_INVALID_AUTHENTICATION_TOKEN };
	}

	const user = await getUserById({ id: authenticationToken.user_id });
	if (!user) {
		set.status = 401;
		return { error: ERRORS.MISSING_INVALID_AUTHENTICATION_TOKEN };
	}

	set.status = 200;
	return { ...authenticationToken, user };
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

export async function addAuthenticationToken({ body, user, set }) {
	const tokenUser = await getUserById({ id: body.user_id });
	if (!tokenUser) {
		set.status = 400;
		return { error: ERRORS.INVALID_USER };
	}

	const authenticationToken = await createAuthenticationToken({
		...body,
		token: body.token?.trim() || crypto.randomUUID(),
		active: Object.hasOwn(body, "active") ? body.active : true,
		created_by: user.id,
		updated_by: user.id,
	});

	set.status = 201;
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
