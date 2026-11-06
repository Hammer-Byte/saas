import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { logger } from "@hammerbyte/utils";
import { toDbDateTime } from "../date.js";
import { GemPage } from "./gem_pom.js";
import {
    createGemKeywordTender,
    getGemKeywordTenderByTenderId,
    updateGemKeywordTenderScanDetailsById,
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
    SCOPE_OF_WORK_FILE: /Scope\s+of\s+Work\s*:?\s*([0-9]+\.pdf)/gi,
    TOTAL_QUANTITY: /Total\s*Quantity\s+(\d+(?:\.\d+)?)/i,
    BID_QUANTITY: /\bBid\s*Quantity\s*[:=]?\s*(\d+(?:\.\d+)?)/i,
    CONSIGNEES_SECTION: /Consignees\/Reporting Officer(?:\s+and\s+Quantity)?/i,
    CONSIGNEE_QTY_ROW:
        /^\s*\d+\s+.+\s+(\d{1,7})\s+(\d{1,4})\s*$/gm,
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
    const document = new URL(href, GEM_URL).href;

    const cookies = await driver.manage().getCookies();
    const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");

    const response = await fetch(document, {
        headers: {
            Cookie: cookieHeader,
            "User-Agent": "Mozilla/5.0",
            Referer: GEM_URL,
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${tenderId}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const header = buffer.subarray(0, 5).toString("latin1");
    if (header !== "%PDF-") {
        throw new Error(
            `Not a PDF for ${tenderId} (content-type: ${contentType || "unknown"}, header: ${JSON.stringify(header)})`,
        );
    }

    const tenderFile = join(TENDERS_DIRECTORY, tenderFileName(tenderId));
    await writeFile(tenderFile, buffer);
    logger.info(`Saved tender PDF: ${tenderId}`);
    return { tenderFile, document, buffer };
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

function extractUrisFromPdfBuffer(buffer) {
    const text = Buffer.from(buffer).toString("latin1");
    const uris = new Set();

    const uriLiteral = /\/URI\s*\(([^)]+)\)/g;
    let match;
    while ((match = uriLiteral.exec(text))) {
        const uri = match[1]
            .replace(/\\\(/g, "(")
            .replace(/\\\)/g, ")")
            .replace(/\\\//g, "/");
        if (/^https?:\/\//i.test(uri)) {
            uris.add(uri);
        }
    }

    const plainHttp = /https?:\/\/[a-zA-Z0-9._~:/?#\[\]@!$&'()*+,;=%\-]+/g;
    while ((match = plainHttp.exec(text))) {
        const uri = match[0].replace(/[.,;)\]]+$/, "");
        if (/gem\.gov\.in/i.test(uri)) {
            uris.add(uri);
        }
    }

    return [...uris];
}

function extractSpecificationLinks({ buffer, pdfText }) {
    const uris = extractUrisFromPdfBuffer(buffer);
    const links = [];
    const seen = new Set();

    const pushLink = (label, url) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        links.push({ label, url });
    };

    const scopeFiles = [
        ...pdfText.matchAll(TENDER_DETAIL_REGEXES.SCOPE_OF_WORK_FILE),
    ].map((match) => match[1]);

    for (const fileName of scopeFiles) {
        const matchedUri = uris.find((uri) => uri.toLowerCase().includes(fileName.toLowerCase()));
        if (matchedUri) {
            pushLink(`Scope of Work: ${fileName}`, matchedUri);
        }
    }

    for (const uri of uris) {
        if (/SpecificationDocument/i.test(uri) || /downloadBuyerDoc/i.test(uri)) {
            pushLink("Buyer Specification Document", uri);
            continue;
        }
        if (/\/swspec_/i.test(uri) || /\/BoqDocument\/[^?]+\.pdf/i.test(uri)) {
            pushLink("Specification Document", uri);
        }
    }

    return links.length ? links : null;
}

function parseQuantityNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
        return 0;
    }
    return Math.round(number);
}

function extractQuantityFromConsignees(text) {
    const sectionMatch = text.match(TENDER_DETAIL_REGEXES.CONSIGNEES_SECTION);
    if (!sectionMatch || sectionMatch.index == null) {
        return 0;
    }

    const sectionStart = sectionMatch.index;
    const sectionEnd = Math.min(text.length, sectionStart + 6000);
    const section = text.slice(sectionStart, sectionEnd);
    let total = 0;
    let matchedRows = 0;

    for (const match of section.matchAll(TENDER_DETAIL_REGEXES.CONSIGNEE_QTY_ROW)) {
        const quantity = parseQuantityNumber(match[1]);
        const deliveryDays = parseQuantityNumber(match[2]);
        // Skip obvious page markers / non-quantity pairs.
        if (quantity <= 0 || deliveryDays <= 0 || deliveryDays > 3650) {
            continue;
        }
        total += quantity;
        matchedRows += 1;
    }

    return matchedRows ? total : 0;
}

function extractQuantity(text) {
    const totalMatch = text.match(TENDER_DETAIL_REGEXES.TOTAL_QUANTITY);
    if (totalMatch?.[1]) {
        return parseQuantityNumber(totalMatch[1]);
    }

    const bidMatch = text.match(TENDER_DETAIL_REGEXES.BID_QUANTITY);
    if (bidMatch?.[1]) {
        return parseQuantityNumber(bidMatch[1]);
    }

    return extractQuantityFromConsignees(text);
}

const extractTenderDetails = (text, buffer) => {
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
        office: valueAfterLabel(text, "Office Name"),
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
        specification_links: extractSpecificationLinks({ buffer, pdfText: text }),
        quantity: extractQuantity(text),
    };
};

function sameDateTime(left, right) {
    return toDbDateTime(left) === toDbDateTime(right);
}

function hasSpecificationLinks(value) {
    if (value == null || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) && parsed.length > 0;
        } catch {
            return false;
        }
    }
    return false;
}

export const processTender = async ({
    tenderFile,
    keyword_id,
    tender_id,
    document = null,
    buffer = null,
    existingTender = null,
}) => {
    try {
        const pdfBuffer = buffer || (await readFile(tenderFile));
        const pdfText = await readTenderText(tenderFile);
        const gemTenderDetails = extractTenderDetails(pdfText, pdfBuffer);

        if (!existingTender) {
            const tenderRowId = await createGemKeywordTender({
                keyword_id,
                tender_id,
                document,
                ...gemTenderDetails,
            });

            if (!tenderRowId) {
                return false;
            }

            logger.info(`Stored tender details: ${tender_id}`);
            return true;
        }

        const datesChanged =
            !sameDateTime(existingTender.start_date_time, gemTenderDetails.start_date_time) ||
            !sameDateTime(existingTender.end_date_time, gemTenderDetails.end_date_time);
        const needsSpecBackfill =
            !hasSpecificationLinks(existingTender.specification_links) &&
            hasSpecificationLinks(gemTenderDetails.specification_links);
        const existingQuantity = Number(existingTender.quantity || 0);
        const needsQuantityBackfill =
            existingQuantity <= 0 && Number(gemTenderDetails.quantity || 0) > 0;

        if (!datesChanged && !needsSpecBackfill && !needsQuantityBackfill) {
            logger.info(`Tender unchanged, skipping update: ${tender_id}`);
            return false;
        }

        await updateGemKeywordTenderScanDetailsById({
            id: existingTender.id,
            document,
            ...gemTenderDetails,
        });

        if (datesChanged) {
            logger.info(
                `Updated tender after date change: ${tender_id} (${toDbDateTime(existingTender.start_date_time)}/${toDbDateTime(existingTender.end_date_time)} -> ${toDbDateTime(gemTenderDetails.start_date_time)}/${toDbDateTime(gemTenderDetails.end_date_time)})`,
            );
        } else {
            logger.info(`Backfilled specification links: ${tender_id}`);
        }

        return true;
    } catch (error) {
        logger.error(`Failed to process tender ${tender_id}: ${error}`);
        return false;
    }
};

export const searchTendersByKeyword = async (
    driver,
    { keyword, id: keyword_id, exact_search = false },
) => {
    if (!keyword || !keyword_id) {
        logger.info("No keyword configured, skipping search.");
        return 0;
    }

    await ensureTenderStorage();

    const page = new GemPage(driver, GEM_URL);

    await page.open();

    if (exact_search) {
        logger.info(`Exact search enabled for keyword: ${keyword}`);
        await page.clickElement(await page.searchTypeDropdown());
        await page.clickElement(await page.exactSearchOption());
    } else {
        logger.info(`Contains/default search for keyword: ${keyword}`);
    }

    const searchInput = await page.searchInput();
    await searchInput.clear();
    await searchInput.sendKeys(keyword);

    await page.clickElement(await page.searchButton());
    await sleep(driver, DELAY_MEDIUM);
    await page.bidCardContainer();

    if (!(await page.isPaginationVisible())) {
        logger.info(`No tenders found for keyword: ${keyword}`);
        return 0;
    }

    const lastPage = await page.getLastPageNumber();
    let changedCount = 0;

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

            try {
                const { tenderFile, document, buffer } = await downloadTender(driver, tender);
                const changed = await processTender({
                    tenderFile,
                    keyword_id,
                    tender_id: tenderId,
                    document,
                    buffer,
                    existingTender,
                });
                if (changed) {
                    changedCount += 1;
                }
            } catch (error) {
                logger.error(`Failed download ${tenderId}: ${error}`);
            }

            await sleep(driver, DELAY_SHORT);
        }

        if (pageNumber < lastPage) {
            await goToNextPage(driver, page);
        }
    }

    return changedCount;
};
