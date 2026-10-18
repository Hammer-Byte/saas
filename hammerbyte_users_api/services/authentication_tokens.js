import { getInjectedTemplate } from "../apis/templates.js";
import { createAuthenticationToken, deleteAuthenticationTokenById, getAllAuthenticationTokens, getAuthenticationTokenById, getAuthenticationTokenByToken, getInactiveAuthenticationTokenByTokenAndOtp, updateAuthenticationTokenById } from "../entities/authentication_tokens.js";
import { getConfigByKey } from "../entities/configs.js";
import { getUserByEmail, getUserById } from "../entities/users.js";
import { AUTH_TOKEN_VALIDITY_MS, CONFIGS, ERRORS } from "../constants.js";

const { CONSTANTS, generator, logger, mailer } = require("@hammerbyte/utils");

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
			return { error: CONSTANTS.ERRORS.MISSING_INVALID_AUTHENTICATION_TOKEN };
		}

		set.status = 200;
		return { ...authenticationToken, user };
	}

	set.status = 401;
	return { error: CONSTANTS.ERRORS.MISSING_INVALID_AUTHENTICATION_TOKEN };
}

export async function requestAuthenticationToken({ body, set }) {
	const email = body.email.trim().toLowerCase();
	const user = await getUserByEmail({ email });

	if (!user) {
		set.status = 404;
		return { error: ERRORS.USER_NOT_FOUND };
	}

	const token = generator.generateToken();
	const otp = generator.generateOTP();

	await createAuthenticationToken({
		user_id: user.id,
		otp,
		token,
		active: false,
		validity: Date.now() + AUTH_TOKEN_VALIDITY_MS,
		created_by: user.id,
		updated_by: user.id,
	});

	try {
		const authenticationToken = process.env.SERVICE_INTERNAL_AUTHENTICATION_TOKEN;
		if (!authenticationToken) {
			logger.error("requestAuthenticationToken mail: SERVICE_INTERNAL_AUTHENTICATION_TOKEN is missing");
		} else {
			const config = await getConfigByKey({
				key: CONFIGS.AUTHENTICATION_TOKEN_MAIL_TEMPLATE_ID,
			});
			const configuredTemplate = config && config.value;
			if (!configuredTemplate) {
				logger.error(
					"requestAuthenticationToken mail: authentication_token_mail_template_id config is missing",
				);
			} else {
				const { injected = false } = await getInjectedTemplate({
					id: Number(configuredTemplate),
					injects: { otp },
					authentication_token: authenticationToken,
				});
				if (!injected) {
					logger.error(
						`requestAuthenticationToken mail: injected template ${configuredTemplate} not found`,
					);
				} else {
					await mailer.send({
						recipient: email,
						subject: "Authentication OTP",
						body: injected,
						html_enabled: true,
					});
				}
			}
		}
	} catch (error) {
		logger.error(`requestAuthenticationToken mail: ${error}`);
	}

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

	await updateAuthenticationTokenById({
		id: authenticationToken.id,
		active: true,
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

	await updateAuthenticationTokenById({
		id: params.id,
		...authenticationTokenUpdate,
	});

	const authenticationToken = await getAuthenticationTokenById(params);
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
