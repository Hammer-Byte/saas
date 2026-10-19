import { rateLimit } from "elysia-rate-limit";
import health from "./health.js";
import configs from "./configs.js";
import authenticationTokens, { validateAuthenticationToken } from "./authentication_tokens.js";

export function publicRoutes(app) {
	return app
		.use(rateLimit())
		.group("/health", health)
		.group("/configs", configs)
		.group("/authentication-tokens", authenticationTokens)
		.use(validateAuthenticationToken);
}

export default publicRoutes;
