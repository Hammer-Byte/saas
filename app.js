import { filer, logger } from "@hammerbyte/utils";
import { generateDBTables } from "./libs/db.js";
import { initContentPublishQueue } from "./libs/content_publish_queue.js";
import transporter from "./libs/transporter.js";
import bucketizer from "./libs/bucketizer.js";
import { allowTraffic } from "./server.js";
import { startServerPingAlertWatcher } from "./libs/server_alert_notify.js";

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
    await initContentPublishQueue();
    logger.success("Content Publish Queue Ready");
    startServerPingAlertWatcher();
    logger.success("Server Ping Alert Watcher Ready");
    allowTraffic();
} catch (error) {
    logger.error(`Application Exited - ${error.message}`);
}

process.on("uncaughtException", (error) => logger.error(error));
process.on("unhandledRejection", (error) => logger.error(error));
