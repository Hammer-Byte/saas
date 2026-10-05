import { getUserByActiveAuthenticationToken } from "../entities/users.js";
import { HEADERS } from "../constants.js";

const { logger } = require("@hammerbyte/utils");

export default async function ({ headers, query, set }) {
	const authenticationToken = headers[HEADERS.AUTHENTICATION_TOKEN];

	let user = null;

	if (authenticationToken) {
		try {
			user = await getUserByActiveAuthenticationToken({
				authentication_token: authenticationToken,
			});
		} catch (exception) {
			logger.error(`parseAuthenticationToken: ${exception}`);
		}
	}

	void query;
	void set;

	return { user };
}
