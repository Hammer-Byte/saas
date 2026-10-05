import { rateLimit } from "elysia-rate-limit";
import health from "./health.js";
import validateAuthenticationToken from "./authentication_tokens.js";

export function publicRoutes(app) {
	return app
		.use(rateLimit())
		.group("/health", health)
		.use(validateAuthenticationToken);
}

export default publicRoutes;
