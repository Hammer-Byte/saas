import requiresUser from "../../middlewares/requires_user.js";
import rolesRoutes from "./roles.js";
import authoritiesRoutes from "./authorities.js";

export function privateRoutes(app) {
	return app
		.onBeforeHandle(requiresUser)
		.group("/roles", rolesRoutes)
		.group("/authorities", authoritiesRoutes);
}

export default privateRoutes;
