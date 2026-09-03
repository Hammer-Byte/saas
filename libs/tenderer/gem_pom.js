import { By } from "selenium-webdriver";

export class GemPage {
    static path = "/all-bids";

    static xpath = {
        searchTypeDropdown: "//button[contains(@class,'searchtype')]",
        exactSearchOption: "//ul[@role='menu']//a[normalize-space()='Exact Search']",
        containsSearchOption: "//ul[@role='menu']//a[normalize-space()='Contains']",
        searchInput: "//input[@name='searchBid' and @placeholder='Enter Keyword']",
        searchButton: "//button[@id='searchBidRA' and contains(@class,'search_btn')]",
        noDataFound: "//*[contains(normalize-space(.),'No data found')]",
        bidCardContainer: "//div[@id='bidCard']",
        bidCards: "//div[@id='bidCard']//div[contains(@class,'card')]",
        tenderDownloadLinks:
            "//div[@id='bidCard']//a[contains(@class,'bid_no_hover') and (contains(@href,'showbidDocument') or contains(@href,'showdirectradocumentPdf') or contains(@href,'showradocumentPdf'))]",
        tenderNumbers: "//div[@id='bidCard']//a[contains(@class,'bid_no_hover')]",
        paginationContainer: "//div[@id='light-pagination']",
        nextPageButton: "//div[@id='light-pagination']//a[contains(@class,'next')]",
        prevPageButton: "//div[@id='light-pagination']//a[contains(@class,'prev')]",
        activePage: "//div[@id='light-pagination']//span[contains(@class,'current')]",
        pageLinks:
            "//div[@id='light-pagination']//a[contains(@class,'page-link') and not(contains(@class,'next')) and not(contains(@class,'prev'))]",
        recordsSummary: "//*[contains(normalize-space(.),'records of')]",
        loadingSpinner: "//div[@id='bidCard']//img[contains(@src,'gemloader.gif')]",
        searchError: "//*[@id='searchError']",
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
    }

    async searchTypeDropdown() {
        return this.driver.findElement(this.by("searchTypeDropdown"));
    }

    async exactSearchOption() {
        return this.driver.findElement(this.by("exactSearchOption"));
    }

    async searchInput() {
        return this.driver.findElement(this.by("searchInput"));
    }

    async searchButton() {
        return this.driver.findElement(this.by("searchButton"));
    }

    async isNoDataFoundVisible() {
        const elements = await this.driver.findElements(this.by("noDataFound"));
        if (!elements.length) return false;
        return elements[0].isDisplayed();
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
        return elements[0].isDisplayed();
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

    async nextPageButton() {
        return this.driver.findElement(this.by("nextPageButton"));
    }

    async clickNextPage() {
        const next = await this.nextPageButton();
        await this.driver.executeScript(
            "arguments[0].scrollIntoView({block:'center'});",
            next,
        );
        await next.click();
    }

    async prevPageButton() {
        return this.driver.findElement(this.by("prevPageButton"));
    }

    async recordsSummary() {
        return this.driver.findElement(this.by("recordsSummary"));
    }
}
