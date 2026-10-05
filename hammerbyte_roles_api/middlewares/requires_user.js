import { ERRORS } from "../constants.js";

export default function requiresUser({ user, set }) {
	if (!user) {
		set.status = 401;
		return { error: ERRORS.MISSING_INVALID_AUTHENTICATION_TOKEN };
	}
}
