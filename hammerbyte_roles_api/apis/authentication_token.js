const { logger } = require("@hammerbyte/utils");

const SERVICE_AUTHENTICATION_TOKEN =
	process.env.SERVICE_AUTHENTICATION_TOKEN || "localhost:3000";
	

export async function getUserByAuthenticationToken({ authentication_token }) {
	const url = `${SERVICE_AUTHENTICATION_TOKEN}/${authentication_token}/validate`;

	try {
		const response = await fetch(url);
		const body = await response.json();
		if (response.status === 200 && body?.user) {
			return body.user;
		}
	} catch (error) {
		logger.error(`getUserByAuthenticationToken: ${error}`);
	}
}
