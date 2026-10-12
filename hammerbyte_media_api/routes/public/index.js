import { rateLimit } from "elysia-rate-limit";
import health from "./health.js";

export function publicRoutes(app) {
	return app.use(rateLimit()).group("/health", health);
}

export default publicRoutes;
