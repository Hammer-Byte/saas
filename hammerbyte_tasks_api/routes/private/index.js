import requiresUser from "../../middlewares/requires_user.js";
import tasksRoutes from "./tasks.js";
import taskStatusesRoutes from "./task_statuses.js";
import taskPrioritiesRoutes from "./task_priorities.js";
import taskCommentsRoutes from "./task_comments.js";

export function privateRoutes(app) {
	return app
		.onBeforeHandle(requiresUser)
		.group("/tasks", tasksRoutes)
		.group("/task-statuses", taskStatusesRoutes)
		.group("/task-priorities", taskPrioritiesRoutes)
		.group("/task-comments", taskCommentsRoutes);
}

export default privateRoutes;
