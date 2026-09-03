import { Builder, Browser } from "selenium-webdriver";
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
        return false;
    }

    (async () => {
        const driver = await new Builder().forBrowser(Browser.FIREFOX).build();
        await driver.manage().window().maximize();

        try {
            for (const keyword of keywordList) {
                await searchTendersByKeyword(driver, keyword);
            }
        } finally {
            await driver.quit();
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
