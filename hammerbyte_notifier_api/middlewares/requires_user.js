const { CONSTANTS } = require("@hammerbyte/utils");

export default function requiresUser({ user, set }) {
	if (!user) {
		set.status = 401;
		return { error: CONSTANTS.ERRORS.MISSING_INVALID_AUTHENTICATION_TOKEN };
	}
}
