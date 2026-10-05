import requiresUser from "../../middlewares/requires_user.js";
import usersRoutes from "./users.js";
import authenticationTokensRoutes from "./authentication_tokens.js";

export function privateRoutes(app) {
	return app
		.onBeforeHandle(requiresUser)
		.group("/users", usersRoutes)
		.group("/authentication-tokens", authenticationTokensRoutes);
}

export default privateRoutes;
