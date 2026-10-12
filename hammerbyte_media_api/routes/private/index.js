import requiresUser from "../../middlewares/requires_user.js";
import mediaRoutes from "./media.js";

export function privateRoutes(app) {
	return app.onBeforeHandle(requiresUser).group("/media", mediaRoutes);
}

export default privateRoutes;
