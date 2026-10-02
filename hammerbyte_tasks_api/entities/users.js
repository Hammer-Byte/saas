import { executeSQLQuery } from "../libs/db.js";

const { logger } = require("@hammerbyte/utils");

/**
 * Resolve the active user for an authentication token.
 * Tasks may share AUTHENTICATION_TOKENS / USERS with the users service,
 * or later call hammerbyte_users_api via apis/.
 */
export async function getUserByActiveAuthenticationToken({ authentication_token }) {
	return await executeSQLQuery({
		queryFunction: (sql) =>
			sql`SELECT USERS.* FROM AUTHENTICATION_TOKENS
				LEFT JOIN USERS ON AUTHENTICATION_TOKENS.user_id = USERS.id
				WHERE AUTHENTICATION_TOKENS.token = ${authentication_token}
					AND AUTHENTICATION_TOKENS.active = true
					AND AUTHENTICATION_TOKENS.validity > CURRENT_TIMESTAMP`,
	})
		.then((users) => {
			if (!users.length) {
				logger.error("getUserByActiveAuthenticationToken: no matching user");
				return;
			}

			return users[0];
		})
		.catch((error) => logger.error(`getUserByActiveAuthenticationToken: ${error}`));
}
