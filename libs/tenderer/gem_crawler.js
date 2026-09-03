import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { logger } from "@hammerbyte/utils";
import { GemPage } from "./gem_pom.js";
import {
    createGemKeywordTender,
    getGemKeywordTenderByTenderId,
} from "../../db/gem_keyword_tenders.js";

const DELAY_SHORT = 1000;
const DELAY_MEDIUM = 2500;

const GEM_URL = "https://bidplus.gem.gov.in";
const TENDERS_DIRECTORY = "downloaded_tenders";

const TENDER_DETAIL_REGEXES = {
    EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    BID_END_DATE_TIME: /Bid End Date\/Time\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/,
    RA_END_DATE_TIME: /RA End Date\/Time\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/,
    BID_OPENING_DATE_TIME:
        /Bid Opening[\s\S]{0,40}?Date\/Time\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/i,
    BID_OPENING_DATE_TIME_FALLBACK: /Bid Opening[\s\S]{0,80}?(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/,
    RA_START_DATE_TIME: /RA Start Date\/Time\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/,
    HOD_EMAIL: /HOD\s*Email id\s*:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    BUYER_EMAIL: /Buyer Email id\s*:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    MINIMUM_AVG_TURNOVER: /Minimum Average Annual Turnover[\s\S]{0,120}?(\d+\s*Lakh\s*\(s\))/i,
    PAST_EXPERIENCE_YEARS: /Years of Past Experience Required[\s\S]{0,80}?(\d+\s*Year\s*\(s\))/i,
    MSE_EXP_RELAXATION: /MSE[\s\S]{0,100}?(Yes|No)\s*\|\s*Complete/gi,
    MSE_TURNOVER_RELAXATION: /Startup[\s\S]{0,100}?(Yes|No)\s*\|\s*Complete/gi,
    DOCUMENT_REQUIRED: /Document required/i,
    ASKED_DOCUMENTS:
        /((?:Experience Criteria|Bidder Turnover|Certificate \(Requested in ATC\)|OEM Authorization Certificate|Additional Doc \d+ \(Requested in ATC\))(?:,\s*(?:Experience Criteria|Bidder Turnover|Certificate \(Requested in ATC\)|OEM Authorization Certificate|Additional Doc \d+ \(Requested in ATC\)))*)/,
    SKIP_VALUE: /Years of Past Experience|MSE|Startup|Document required/i,
    DEVANAGARI_START: /^[\u0900-\u097F]/,
};

const sleep = (driver, ms) => driver.sleep(ms);

const tenderFileName = (tenderId) =>
    `${Buffer.from(String(tenderId), "utf8").toString("base64url")}.pdf`;

async function ensureTenderStorage() {
    await mkdir(TENDERS_DIRECTORY, { recursive: true });
}

const downloadTender = async (driver, tender) => {
    const tenderId = (await tender.getText()).trim();
    const href = await tender.getAttribute("href");
    const pdfUrl = new URL(href, GEM_URL).href;

    const cookies = await driver.manage().getCookies();
    const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");

    const response = await fetch(pdfUrl, {
        headers: {
            Cookie: cookieHeader,
            "User-Agent": "Mozilla/5.0",
            Referer: GEM_URL,
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${tenderId}`);
    }

    const tenderFile = join(TENDERS_DIRECTORY, tenderFileName(tenderId));
    await writeFile(tenderFile, Buffer.from(await response.arrayBuffer()));
    logger.info(`Saved tender PDF: ${tenderId}`);
    return tenderFile;
};

const goToNextPage = async (driver, page) => {
    await page.clickNextPage();
    await sleep(driver, DELAY_MEDIUM);
    await page.bidCardContainer();
};

const readTenderText = async (tenderFile) => {
    const process = Bun.spawn(["pdftotext", "-layout", tenderFile, "-"], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const text = await new Response(process.stdout).text();
    const code = await process.exited;

    if (code !== 0) {
        const errorText = await new Response(process.stderr).text();
        throw new Error(errorText.trim() || `pdftotext failed for ${tenderFile}`);
    }

    return text;
};

const cleanValue = (value) => value?.replace(/\s+/g, " ").trim() || null;

const valueAfterLabel = (text, label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sameLine = text.match(new RegExp(`${escaped}\\s{2,}([^\\n]+)`, "i"));
    if (sameLine?.[1]) {
        const value = cleanValue(sameLine[1]);
        if (
            value &&
            !TENDER_DETAIL_REGEXES.DEVANAGARI_START.test(value) &&
            !TENDER_DETAIL_REGEXES.SKIP_VALUE.test(value)
        ) {
            return value;
        }
    }
    return null;
};

const extractDocumentsRequired = (text) => {
    const docsIdx = text.search(TENDER_DETAIL_REGEXES.DOCUMENT_REQUIRED);
    if (docsIdx < 0) return null;

    const window = text.slice(Math.max(0, docsIdx - 500), docsIdx + 250).replace(/\s+/g, " ");
    const match = window.match(TENDER_DETAIL_REGEXES.ASKED_DOCUMENTS);

    return cleanValue(match?.[1]);
};

const extractTenderDetails = (text) => {
    const end_date_time =
        text.match(TENDER_DETAIL_REGEXES.BID_END_DATE_TIME)?.[1] ||
        text.match(TENDER_DETAIL_REGEXES.RA_END_DATE_TIME)?.[1] ||
        null;

    const start_date_time =
        text.match(TENDER_DETAIL_REGEXES.BID_OPENING_DATE_TIME)?.[1] ||
        text.match(TENDER_DETAIL_REGEXES.BID_OPENING_DATE_TIME_FALLBACK)?.[1] ||
        text.match(TENDER_DETAIL_REGEXES.RA_START_DATE_TIME)?.[1] ||
        null;

    return {
        start_date_time,
        end_date_time,
        ministry: valueAfterLabel(text, "Ministry/State Name"),
        department: valueAfterLabel(text, "Department Name"),
        organization: valueAfterLabel(text, "Organisation Name"),
        office: valueAfterLabel(text, "Item Category"),
        hod_email: text.match(TENDER_DETAIL_REGEXES.HOD_EMAIL)?.[1] || null,
        buyer_email: text.match(TENDER_DETAIL_REGEXES.BUYER_EMAIL)?.[1] || null,
        buyer_phone: null,
        required_minimum_average_turnover:
            text.match(TENDER_DETAIL_REGEXES.MINIMUM_AVG_TURNOVER)?.[1] || null,
        required_past_experice_years:
            text.match(TENDER_DETAIL_REGEXES.PAST_EXPERIENCE_YEARS)?.[1] || null,
        mse_experience_relaxation:
            [...text.matchAll(TENDER_DETAIL_REGEXES.MSE_EXP_RELAXATION)].at(-1)?.[1] || null,
        mse_turnover_relaxation:
            [...text.matchAll(TENDER_DETAIL_REGEXES.MSE_TURNOVER_RELAXATION)].at(-1)?.[1] ||
            null,
        asked_documents: extractDocumentsRequired(text),
    };
};

export const processTender = async ({ tenderFile, keyword_id, tender_id }) => {
    try {
        const pdfText = await readTenderText(tenderFile);
        const gemTenderDetails = extractTenderDetails(pdfText);

        createGemKeywordTender({
            keyword_id,
            tender_id,
            ...gemTenderDetails,
        });

        logger.info(`Stored tender details: ${tender_id}`);
    } catch (error) {
        logger.error(`Failed to process tender ${tender_id}: ${error}`);
    }
};

export const searchTendersByKeyword = async (driver, { keyword, id: keyword_id }) => {
    if (!keyword || !keyword_id) {
        logger.info("No keyword configured, skipping search.");
        return;
    }

    await ensureTenderStorage();

    const page = new GemPage(driver, GEM_URL);

    await page.open();

    await (await page.searchTypeDropdown()).click();
    await (await page.exactSearchOption()).click();

    const searchInput = await page.searchInput();
    await searchInput.clear();
    await searchInput.sendKeys(keyword);

    await (await page.searchButton()).click();
    await sleep(driver, DELAY_MEDIUM);
    await page.bidCardContainer();

    if (!(await page.isPaginationVisible())) {
        logger.info(`No tenders found for keyword: ${keyword}`);
        return;
    }

    const lastPage = 2;

    for (let pageNumber = 1; pageNumber <= lastPage; pageNumber++) {
        logger.info(`Downloading page ${pageNumber} of ${lastPage} for ${keyword}...`);

        const tenders = await page.tenderDownloadLinks();

        for (let index = 0; index < tenders.length; index++) {
            const tender = (await page.tenderDownloadLinks())[index];
            const tenderId = (await tender.getText()).trim();

            if (!tenderId) {
                continue;
            }

            const existingTender = await getGemKeywordTenderByTenderId({ tender_id: tenderId });
            if (existingTender) {
                continue;
            }

            try {
                const tenderFile = await downloadTender(driver, tender);
                await processTender({ tenderFile, keyword_id, tender_id: tenderId });
            } catch (error) {
                logger.error(`Failed download ${tenderId}: ${error}`);
            }

            await sleep(driver, DELAY_SHORT);
        }

        if (pageNumber < lastPage) {
            await goToNextPage(driver, page);
        }
    }
};
