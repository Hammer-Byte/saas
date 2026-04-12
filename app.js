import { generateDBTables } from "./libs/db.js";
import transporter from "./libs/transporter.js";
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


try {
    await transporter.init();
    logger.success("Email Transporter Ready");
    filer.prepareDirectories(REQUIRED_DIRS);
    logger.success("Required Directories Ready");
    await generateDBTables();
    logger.success("Database Ready (Tables Verified)");
    allowTraffic();
} catch (e) {
    logger.error(`Application Exited - ${e.message}`);
}



process.on("uncaughtException", (error) => logger.error(error));
process.on("unhandledRejection", (error) => logger.error(error));
