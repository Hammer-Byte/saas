import { Builder, Browser } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { logger } from "@hammerbyte/utils";

/**
 * Headless Firefox for GeM tender scanning.
 */
export async function openHeadlessFirefox({
    width = 1920,
    height = 1080,
    label = "gem-scan",
} = {}) {
    logger.info(`${label} browser launch headless`);
    const options = new firefox.Options()
        .addArguments("-headless")
        .windowSize({ width, height });

    const driver = await new Builder()
        .forBrowser(Browser.FIREFOX)
        .setFirefoxOptions(options)
        .build();

    logger.info(`${label} browser ready`);
    return driver;
}

export async function quitDriver(driver, label = "gem-scan") {
    if (!driver) {
        return;
    }
    await driver.quit().catch((error) => {
        logger.error(`${label} driver quit failed: ${error}`);
    });
}
