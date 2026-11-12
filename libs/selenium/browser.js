import { Builder, Browser } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { logger } from "@hammerbyte/utils";

const FIREFOX_BINARY = "/usr/bin/firefox";

/**
 * Shared Firefox opener for LinkedIn / content-publish style jobs.
 * GeM uses headless via openHeadlessFirefox.
 */
export async function openFirefox({
    headless = false,
    width = 1440,
    height = 1000,
    label = "selenium",
} = {}) {
    logger.info(
        `${label} browser launch binary=${FIREFOX_BINARY} headless=${headless ? "1" : "0"} moz_headless=${Bun.env.MOZ_HEADLESS || "0"}`,
    );

    const options = new firefox.Options()
        .setBinary(FIREFOX_BINARY)
        .setPageLoadStrategy("eager")
        .windowSize({ width, height });

    if (headless) {
        options.addArguments("-headless");
    }

    const driver = await new Builder()
        .forBrowser(Browser.FIREFOX)
        .setFirefoxOptions(options)
        .build();

    await driver.manage().setTimeouts({ implicit: 0, pageLoad: 20_000 });
    logger.info(`${label} browser ready`);
    return driver;
}

export async function openHeadlessFirefox({
    width = 1920,
    height = 1080,
    label = "selenium-headless",
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

export async function quitDriver(driver, label = "selenium") {
    if (!driver) {
        return;
    }
    await driver.quit().catch((error) => {
        logger.error(`${label} driver quit failed: ${error}`);
    });
}
