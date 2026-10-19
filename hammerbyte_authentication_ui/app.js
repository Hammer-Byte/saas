import { serve } from "bun";
import index from "./src/index.html";

const { logger } = require("@hammerbyte/utils");

try {
	logger.init();

	const server = serve({
		port: Number(process.env.PORT) || 3000,
		routes: {
			"/*": index,
		},
		development: process.env.NODE_ENV !== "production" && {
			hmr: true,
			console: true,
		},
	});

	logger.success(`Server listening on ${server.url}`);
} catch (error) {
	logger.error(error);
	process.exit(1);
}

process.on("uncaughtException", (error) => logger.error(error));
process.on("unhandledRejection", (error) => logger.error(error));
