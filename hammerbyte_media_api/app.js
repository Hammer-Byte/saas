import { executeDBSeeders, generateDBTables } from "./libs/db.js";
import { allowTraffic, createApp } from "./server.js";
import { STORAGE_DIRS, STORAGE_PATH } from "./constants.js";

const { mailer, bucketizer, filer, logger } = require("@hammerbyte/utils");

try {
	logger.init();
	logger.success("Logger Ready");

	mailer.init({
		applicationId: Bun.env.APPLICATION_ID,
		applicationToken: Bun.env.APPLICATION_TOKEN,
	});
	logger.success("Mailer Ready");

	bucketizer.init({
		applicationId: Bun.env.APPLICATION_ID,
		applicationToken: Bun.env.APPLICATION_TOKEN,
	});
	logger.success("Bucketizer Ready");

	filer.prepareDirectories([STORAGE_DIRS.MEDIA], STORAGE_PATH);
	logger.success("Storage Directory Ready");

	await generateDBTables();
	logger.success("Tables Ready");

	if (Bun.env.MYSQL_DB_SEEDERS) {
		const seeders = JSON.parse(Bun.env.MYSQL_DB_SEEDERS);
		await executeDBSeeders({ seeders });
	}

	const app = createApp();
	await allowTraffic(app);
	logger.success("Incoming Traffic Allowed....");
} catch (exception) {
	logger.error(exception);
	process.exit(1);
}

process.on("uncaughtException", (error) => logger.error(error));
process.on("unhandledRejection", (error) => logger.error(error));
