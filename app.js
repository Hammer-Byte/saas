import { filer, logger } from "@hammerbyte/utils";
import { generateDBTables } from "./libs/db.js";
import transporter from "./libs/transporter.js";
import bucketizer from "./libs/bucketizer.js";
import { allowTraffic } from "./server.js";

logger.init({
    saveLogs: false,
});

try {
    await transporter.init();
    logger.success("Email Transporter Ready");
    await bucketizer.init();
    logger.success("Bucketizer Ready");
    filer.prepareDirectories([Bun.env.DIRECTORY_MEDIA]);
    logger.success("Required Directories Ready");
    await generateDBTables();
    logger.success("Database Ready (Tables Verified)");
    allowTraffic();
} catch (error) {
    logger.error(`Application Exited - ${error.message}`);
}

process.on("uncaughtException", (error) => logger.error(error));
process.on("unhandledRejection", (error) => logger.error(error));
