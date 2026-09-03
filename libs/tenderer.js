import { Builder, Browser } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { logger } from "@hammerbyte/utils";
import { searchTendersByKeyword } from "./tenderer/gem_crawler.js";

export let processing = false;

export function crawlGemForTenders({ keywords = [] } = {}) {
    if (processing) {
        return false;
    }

    processing = true;

    const keywordList = (keywords || [])
        .map((entry) => ({
            id: entry?.id,
            keyword: String(entry?.keyword || "").trim(),
        }))
        .filter((entry) => entry.id && entry.keyword);

    if (!keywordList.length) {
        processing = false;
        return false;
    }

    (async () => {
        let driver = null;

        try {
            const options = new firefox.Options()
                .addArguments("-headless")
                .windowSize({ width: 1920, height: 1080 });

            driver = await new Builder()
                .forBrowser(Browser.FIREFOX)
                .setFirefoxOptions(options)
                .build();

            for (const keyword of keywordList) {
                await searchTendersByKeyword(driver, keyword);
            }
        } finally {
            if (driver) {
                await driver.quit().catch((error) => {
                    logger.error(`gem tenderer driver quit failed: ${error}`);
                });
            }
        }
    })()
        .catch((error) => {
            logger.error(`gem tenderer crawl failed: ${error}`);
        })
        .finally(() => {
            processing = false;
        });

    return true;
}
