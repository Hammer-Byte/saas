import { generateDBTables } from "./libs/db.js";
import { allowTraffic } from "./server.js";

const { filer, logger } = require("@hammerbyte/utils");

const DIRECTORY_CONFIGS = Bun.env.DIRECTORY_CONFIGS || "configs";
const DIRECTORY_LOGS = Bun.env.DIRECTORY_LOGS || "logs";
const REQUIRED_DIRS = [DIRECTORY_LOGS, DIRECTORY_CONFIGS];

//initiate the logger
logger.init({
    saveLogs: Bun.env.SAVE_LOGS, // Set to true to write to files
    logsDirectory: "logs", // This folder will be created automatically
});

logger.info(Bun.env.MYSQL_HOST);
logger.info(process.env.MYSQL_HOST);

logger.info(Bun.env.MYSQL_PORT);
logger.info(Bun.env.MYSQL_DB);
logger.info(Bun.env.MYSQL_USERNAME);
logger.info(Bun.env.MYSQL_PASSWORD);

try {
    filer.prepareDirectories(REQUIRED_DIRS);
    logger.success("Required Directories Ready");
    await generateDBTables();
    logger.success("Database Ready (Tables Verified)");
    allowTraffic();
} catch (e) {
    logger.error(`Application Exited - ${e.message}`);
}
