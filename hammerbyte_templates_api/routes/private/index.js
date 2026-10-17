import requiresUser from "../../middlewares/requires_user.js";
import templateTypesRoutes from "./template_types.js";
import templatesRoutes from "./templates.js";

export function privateRoutes(app) {
	return app
		.onBeforeHandle(requiresUser)
		.group("/template-types", templateTypesRoutes)
		.group("/templates", templatesRoutes);
}

export default privateRoutes;
