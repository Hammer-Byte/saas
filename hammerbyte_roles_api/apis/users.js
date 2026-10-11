const { CONSTANTS, logger } = require("@hammerbyte/utils");

const SERVICE_USERS = process.env.SERVICE_USERS || "localhost:3000";

export async function getUserById({ id, authentication_token }) {
	const url = `${SERVICE_USERS}/users/${id}`;

	try {
		const response = await fetch(url, {
			headers: {
				[CONSTANTS.HEADERS.AUTHENTICATION_TOKEN]: authentication_token,
			},
		});
		if (response.status === 200) {
			return await response.json();
		}
	} catch (error) {
		logger.error(`getUserById: ${error}`);
	}
}

export async function getUserByIds({ ids = [], authentication_token }) {
	if (!ids.length) {
		return [];
	}

	const url = `${SERVICE_USERS}/users?ids=${ids.join(",")}`;

	try {
		const response = await fetch(url, {
			headers: {
				[CONSTANTS.HEADERS.AUTHENTICATION_TOKEN]: authentication_token,
			},
		});
		if (response.status === 200) {
			return await response.json();
		}
	} catch (error) {
		logger.error(`getUserByIds: ${error}`);
	}
}
