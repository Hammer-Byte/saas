import requiresUser from "../../middlewares/requires_user.js";
import emailBatchesRoutes from "./email_batches.js";
import emailsRoutes from "./emails.js";

export function privateRoutes(app) {
	return app
		.onBeforeHandle(requiresUser)
		.group("/email-batches", emailBatchesRoutes)
		.group("/emails", emailsRoutes);
}

export default privateRoutes;
