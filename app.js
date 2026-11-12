import { filer, logger } from "@hammerbyte/utils";
import { generateDBTables } from "./libs/db.js";
import { initSeleniumPipeline } from "./libs/selenium/index.js";
import transporter from "./libs/transporter.js";
import bucketizer from "./libs/bucketizer.js";
import { allowTraffic } from "./server.js";
import { startServerPingAlertWatcher } from "./libs/server_alert_notify.js";
import { startGemTenderEligibilityReminderWatcher } from "./libs/gem_tender_eligibility_remind.js";
import { startGemTenderUnattendedWatcher } from "./libs/gem_tender_unattended.js";
import { startInquiryFollowupReminderWatcher } from "./libs/inquiry_followup_remind.js";
import { startTaskReminderWatcher } from "./libs/task_remind.js";

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
    await initSeleniumPipeline();
    logger.success("Selenium Pipeline Ready");
    startServerPingAlertWatcher();
    logger.success("Server Ping Alert Watcher Ready");
    startGemTenderEligibilityReminderWatcher();
    logger.success("GEM Tender Eligibility Reminder Watcher Ready");
    startGemTenderUnattendedWatcher();
    logger.success("GEM Tender Unattended Watcher Ready");
    startTaskReminderWatcher();
    logger.success("Task Reminder Watcher Ready");
    startInquiryFollowupReminderWatcher();
    logger.success("Inquiry Follow-up Reminder Watcher Ready");
    allowTraffic();
} catch (error) {
    logger.error(`Application Exited - ${error.message}`);
}

process.on("uncaughtException", (error) => logger.error(error));
process.on("unhandledRejection", (error) => logger.error(error));
