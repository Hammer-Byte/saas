import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import publicRoutes from "./routes/public/index.js";
import privateRoutes from "./routes/private/index.js";
import parseAuthenticationToken from "./middlewares/parse_authentication_token.js";
import { HEADERS, SWAGGER } from "./constants.js";

const { logger, middlewares } = require("@hammerbyte/utils");

export function createApp() {
	const allowedOrigins = (process.env.ALLOWED_CORS_ORIGINS || "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

	return new Elysia()
		.use(
			cors({
				origin: (context) => {
					const origin = context.headers.origin;
					if (!origin) return true;
					return allowedOrigins.includes(origin);
				},
				credentials: true,
				methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
				allowedHeaders: ["Content-Type", HEADERS.AUTHENTICATION_TOKEN],
			}),
		)
		.use(
			swagger({
				documentation: {
					info: {
						title: SWAGGER.APPLICATION,
						version: "1.0.0",
					},
				},
			}),
		);
}

export async function allowTraffic(app) {
	app.onRequest(middlewares.bun.requestLogger);
	app.derive({ as: "global" }, parseAuthenticationToken);

	app.use(publicRoutes);
	app.use(privateRoutes);

	app.listen(process.env.PORT);

	const { server } = app;

	logger.success(`Server listening on ${server.url}`);
}
