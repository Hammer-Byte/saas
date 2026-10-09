import requiresUser from "../../middlewares/requires_user.js";
import projectsRoutes from "./projects.js";
import projectUsersRoutes from "./project_users.js";
import projectDirectoriesRoutes from "./project_directories.js";
import directoryDocumentsRoutes from "./directory_documents.js";
import projectApplicationsRoutes from "./project_applications.js";
import projectInvoicesRoutes from "./project_invoices.js";
import invoiceItemsRoutes from "./invoice_items.js";

export function privateRoutes(app) {
	return app
		.onBeforeHandle(requiresUser)
		.group("/projects", projectsRoutes)
		.group("/project-users", projectUsersRoutes)
		.group("/directories", projectDirectoriesRoutes)
		.group("/directory-documents", directoryDocumentsRoutes)
		.group("/project-applications", projectApplicationsRoutes)
		.group("/project-invoices", projectInvoicesRoutes)
		.group("/invoice-items", invoiceItemsRoutes);
}

export default privateRoutes;
