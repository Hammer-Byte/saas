import { By, until } from "selenium-webdriver";

export class GemPage {
    static path = "/advance-search";

    static xpath = {
        categorySelect: "//select[@id='categorybid']",
        bidNumberInput: "//input[@id='bno']",
        searchButton: "//a[@id='searchByBid']",
        noDataFound:
            "//div[@id='bidCard']//*[contains(normalize-space(.),'No data found')]",
        bidCardContainer: "//div[@id='bidCard']",
        // Direct children only — avoid matching nested .card-body.
        bidCards: "//div[@id='bidCard']/div[@class='card']",
        tenderDownloadLinks:
            "//div[@id='bidCard']//a[contains(@class,'bid_no_hover') and (contains(@href,'showbidDocument') or contains(@href,'showdirectradocumentPdf') or contains(@href,'showradocumentPdf'))]",
        cardBidDownloadLinks:
            ".//a[contains(@class,'bid_no_hover') and (contains(@href,'showbidDocument') or contains(@href,'showdirectradocumentPdf') or contains(@href,'showradocumentPdf'))]",
        paginationContainer: "//div[@id='light-pagination']",
        nextPageButton: "//div[@id='light-pagination']//a[contains(@class,'next')]",
        prevPageButton: "//div[@id='light-pagination']//a[contains(@class,'prev')]",
        activePage: "//div[@id='light-pagination']//span[contains(@class,'current')]",
        pageLinks:
            "//div[@id='light-pagination']//a[contains(@class,'page-link') and not(contains(@class,'next')) and not(contains(@class,'prev'))]",
        recordsSummary: "//div[@id='bidCard']//*[contains(normalize-space(.),'records of')]",
        loadingSpinner: "//div[@id='bidCard']//img[contains(@src,'gemloader.gif')]",
    };

    constructor(driver, baseUrl) {
        this.driver = driver;
        this.baseUrl = baseUrl;
    }

    url() {
        return `${this.baseUrl}${GemPage.path}`;
    }

    by(key) {
        return By.xpath(GemPage.xpath[key]);
    }

    async open() {
        await this.driver.get(this.url());
        await this.driver.wait(until.elementLocated(this.by("categorySelect")), 20000);
        await this.driver.wait(until.elementLocated(this.by("searchButton")), 20000);
        await this.driver.sleep(1000);
    }

    async clickElement(element) {
        await this.driver.executeScript(
            "arguments[0].scrollIntoView({block:'center', inline:'nearest'});",
            element,
        );
        await this.driver.sleep(200);
        try {
            await element.click();
        } catch {
            await this.driver.executeScript("arguments[0].click();", element);
        }
    }

    async clearBidNumber() {
        await this.driver.executeScript(`
            const input = document.querySelector("#bno");
            if (input) {
                input.value = "";
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
            }
        `);
    }

    async setBidNumber(bidNumber) {
        const value = String(bidNumber || "").trim();
        await this.clearBidNumber();
        const input = await this.driver.findElement(this.by("bidNumberInput"));
        await input.clear();
        await input.sendKeys(value);
    }

    /**
     * Match a GeM Category Select2 option for the keyword, then select it.
     * exact_search: option text must equal the keyword (case-insensitive).
     * otherwise: prefer exact, then starts-with, then contains.
     * @returns {{ ok: boolean, text?: string, value?: string }}
     */
    async selectCategoryByKeyword(keyword, exactSearch = false) {
        const result = await this.driver.executeScript(
            `
            const keyword = String(arguments[0] || "").trim();
            const exactSearch = !!arguments[1];
            const select = document.querySelector("#categorybid");
            if (!select || !keyword) {
                return { ok: false, reason: "missing_select_or_keyword" };
            }

            const normalize = (value) => String(value || "").trim().toLowerCase();
            const needle = normalize(keyword);
            const options = Array.from(select.options).filter((option) => option.value);

            let match = options.find((option) => normalize(option.textContent) === needle);
            if (!match && !exactSearch) {
                match =
                    options.find((option) => normalize(option.textContent).startsWith(needle)) ||
                    options.find((option) => normalize(option.textContent).includes(needle));
            }

            if (!match) {
                return { ok: false, reason: "no_category_match" };
            }

            if (window.jQuery) {
                window.jQuery(select).val(match.value).trigger("change");
            } else {
                select.value = match.value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
            }

            return {
                ok: true,
                text: String(match.textContent || "").trim(),
                value: match.value,
            };
            `,
            keyword,
            exactSearch,
        );

        return result && typeof result === "object" ? result : { ok: false };
    }

    async searchButton() {
        return this.driver.findElement(this.by("searchButton"));
    }

    async clickSearch() {
        await this.clickElement(await this.searchButton());
    }

    async waitForSearchSettled(timeoutMs = 30000) {
        await this.driver.wait(async () => {
            const spinners = await this.driver.findElements(this.by("loadingSpinner"));
            for (const spinner of spinners) {
                try {
                    if (await spinner.isDisplayed()) {
                        return false;
                    }
                } catch {
                    // Stale spinner node means the loader was replaced.
                }
            }

            if (await this.isNoDataFoundVisible()) {
                return true;
            }

            const cards = await this.driver.findElements(this.by("bidCards"));
            return cards.length > 0;
        }, timeoutMs);
    }

    async isNoDataFoundVisible() {
        const elements = await this.driver.findElements(this.by("noDataFound"));
        if (!elements.length) return false;
        try {
            return elements[0].isDisplayed();
        } catch {
            return false;
        }
    }

    async bidCardContainer() {
        return this.driver.findElement(this.by("bidCardContainer"));
    }

    async paginationContainer() {
        return this.driver.findElement(this.by("paginationContainer"));
    }

    async isPaginationVisible() {
        const elements = await this.driver.findElements(this.by("paginationContainer"));
        if (!elements.length) return false;
        try {
            return elements[0].isDisplayed();
        } catch {
            return false;
        }
    }

    async getLastPageNumber() {
        const summaries = await this.driver.findElements(this.by("recordsSummary"));
        if (summaries.length) {
            const text = await summaries[0].getText();
            const match = text.match(/records of\s+([\d,]+)\s+records/i);
            if (match) {
                const totalRecords = parseInt(match[1].replace(/,/g, ""), 10);
                if (Number.isFinite(totalRecords) && totalRecords > 0) {
                    return Math.ceil(totalRecords / 10);
                }
            }
        }

        const links = await this.driver.findElements(this.by("pageLinks"));
        if (!links.length) return 1;

        const lastText = (await links[links.length - 1].getText()).trim();
        const lastPage = parseInt(lastText, 10);
        return Number.isFinite(lastPage) && lastPage > 0 ? lastPage : 1;
    }

    async bidCards() {
        return this.driver.findElements(this.by("bidCards"));
    }

    async tenderDownloadLinks() {
        return this.driver.findElements(this.by("tenderDownloadLinks"));
    }

    async cardBidDownloadLinks(card) {
        return card.findElements(By.xpath(GemPage.xpath.cardBidDownloadLinks));
    }

    async nextPageButton() {
        return this.driver.findElement(this.by("nextPageButton"));
    }

    async clickNextPage() {
        await this.clickElement(await this.nextPageButton());
    }

    async prevPageButton() {
        return this.driver.findElement(this.by("prevPageButton"));
    }

    async recordsSummary() {
        return this.driver.findElement(this.by("recordsSummary"));
    }
}
