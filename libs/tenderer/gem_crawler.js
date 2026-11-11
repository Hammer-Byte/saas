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
    // Quantity extractors (tried in order by extractQuantity).
    // Captured numbers may include western/Indian thousand separators; stripped in parseQuantityNumber.
    TOTAL_QUANTITY_SAME:
        /Total\s*(?:Quantity|Qty)[\s:\u00a0\-]*([\d,]+(?:\.\d+)?)/i,
    TOTAL_QUANTITY_MULTILINE:
        /Total\s*(?:Quantity|Qty)[^\d\n]{0,80}\n[^\d\n]{0,40}([\d,]+(?:\.\d+)?)/i,
    ITEM_PIECES_LINE: /^.{0,160}?\(\s*([\d,]+)\s*(?:pieces?|units?)\s*\)\s*$/i,
    ITEM_PIECES_ONLY: /^\(\s*([\d,]+)\s*(?:pieces?|units?)\s*\)$/i,
    BID_QUANTITY: /\bBid\s*(?:Quantity|Qty)\s*[:=\-]?\s*([\d,]+(?:\.\d+)?)/i,
    CONSIGNEES_SECTION: /Consignees\/Reporting Officer(?:\s+and\s+Quantity)?/gi,
    CONSIGNEE_QTY_ROW: /^\s*\d+\s+.+\s+(\d{1,7})\s+(\d{1,4})\s*$/gm,
    CONSIGNEE_QTY_DAYS_ONLY: /^\s*(\d{1,7})\s+(\d{1,4})\s*$/gm,
    // AMC / service consignee columns: "Number of each Asset", "Number of Devices",
    // "Quantity of Data Center Assets", etc. (not goods qty+delivery-days tables).
    SERVICE_CONSIGNEE_COLUMN:
        /\/\s*Number of|\/\s*Quantity of|each\s+Asset|for\s+AMC|Number of Devices|Resources\s+to/i,
    SERVICE_CONSIGNEE_QTY_ROW:
        /^\s*\d+\s+[A-Za-z*][^\n/]{3,}?\s+(\d{1,7})\s*(?:Resident engineers|N\/A)?\s*$/gm,
    RESOURCE_HIRE_MARKERS: /Resources\s+to[\s\S]{0,80}?be\s+hired/i,
    RESOURCE_QTY_ROW:
        /^\s*\d+\s+[^\n]*?\*{3,}[^\n]*?\*{3,}[^\n]*?\s+(\d{1,6})\b/gm,
    SERVICE_ITEM_DOC_MARKERS:
        /Annual Maintenance|Maintenance Contract|each\s+Asset|for\s+AMC|Networking Devices/i,
    SERVICE_ITEM_PAREN_SAME: /\(\s*([\d,]+)\s*\)\s*$/,
    SERVICE_ITEM_PAREN_ONLY: /^\(\s*([\d,]+)\s*\)$/,
    SERVICE_ITEM_PAREN_OPEN: /\(\s*$/,
    SERVICE_ITEM_PAREN_CLOSE: /^([\d,]+)\s*\)$/,
    ATC_QTY_NOS: /\b([\d,]+(?:\.\d+)?)\s*Nos\.?\b/gi,
    // EMD amount (GeM "EMD Detail" block).
    EMD_DETAIL: /EMD\s*Detail/i,
    EMD_SECTION_END:
        /ePBG\s*Detail|Bid\s+splitting|MII\s+Purchase|MSE\s+Purchase/i,
    EMD_REQUIRED_NO: /Required\s+No/i,
    EMD_AMOUNT_LABEL: /(?:\/\s*EMD\b|EMD\s*Amount)/gi,
    EMD_AMOUNT_IS: /EMD\s*AMOUNT\s+IS\s+([\d,]+(?:\.\d+)?)\s*INR/gi,
    EMD_MONEY_NUMBER: /([\d,]{2,}(?:\.\d+)?)/g,
    EMD_APPLICABLE_PROSE: /will\s+be\s+applicable/i,
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
    if (value == null) {
        return 0;
    }
    const normalized = String(value).replace(/,/g, "").trim();
    const number = Number(normalized);
    if (!Number.isFinite(number) || number < 0) {
        return 0;
    }
    return Math.round(number);
}

function parseMoneyAmount(value) {
    if (value == null) {
        return 0;
    }
    const normalized = String(value).replace(/,/g, "").trim();
    const number = Number(normalized);
    if (!Number.isFinite(number) || number <= 0) {
        return 0;
    }
    return Math.round(number * 100) / 100;
}

function firstPositiveQuantity(...candidates) {
    for (const candidate of candidates) {
        const quantity = parseQuantityNumber(candidate);
        if (quantity > 0) {
            return quantity;
        }
    }
    return 0;
}

/** Way 1: Bid Details "Total Quantity/Qty N" (same line or nearby next line). */
function extractQuantityFromTotalLabel(text) {
    return firstPositiveQuantity(
        text.match(TENDER_DETAIL_REGEXES.TOTAL_QUANTITY_SAME)?.[1],
        text.match(TENDER_DETAIL_REGEXES.TOTAL_QUANTITY_MULTILINE)?.[1],
    );
}

/**
 * Way 2: Sum item headers like "Desktop Computer ( 11 pieces )".
 * Also handles split lines: title then "( 11 pieces )" on the next line.
 * Skips "Additional Specification Parameters - … ( N pieces )" duplicates.
 */
function extractQuantityFromItemPieces(text) {
    const lines = String(text || "")
        .split(/\n/)
        .map((line) => line.replace(/\f/g, "").trim());
    let total = 0;
    let matched = 0;

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line || /Additional Specification Parameters/i.test(line)) {
            continue;
        }

        let quantity = 0;
        const sameLine = line.match(TENDER_DETAIL_REGEXES.ITEM_PIECES_LINE);
        if (sameLine?.[1] && !TENDER_DETAIL_REGEXES.ITEM_PIECES_ONLY.test(line)) {
            quantity = parseQuantityNumber(sameLine[1]);
        } else if (TENDER_DETAIL_REGEXES.ITEM_PIECES_ONLY.test(line)) {
            const only = line.match(TENDER_DETAIL_REGEXES.ITEM_PIECES_ONLY);
            const previous = [...lines.slice(0, i)].reverse().find(Boolean) || "";
            if (
                only?.[1] &&
                previous &&
                previous.length >= 8 &&
                !/Additional Specification Parameters/i.test(previous)
            ) {
                quantity = parseQuantityNumber(only[1]);
            }
        } else if (/\(\s*$/.test(line) && i + 1 < lines.length) {
            const next = lines[i + 1].match(/^([\d,]+)\s*(?:pieces?|units?)\s*\)$/i);
            if (next?.[1] && line.length >= 8) {
                quantity = parseQuantityNumber(next[1]);
                i += 1;
            }
        }

        if (quantity <= 0) {
            continue;
        }
        total += quantity;
        matched += 1;
    }

    return matched ? total : 0;
}

/** Way 3: Explicit "Bid Quantity: N". */
function extractQuantityFromBidQuantity(text) {
    return firstPositiveQuantity(text.match(TENDER_DETAIL_REGEXES.BID_QUANTITY)?.[1]);
}

/**
 * Way 4: Sum consignee table rows (qty + delivery days).
 * Prefer same-line "S.No … qty days" rows; only if none match, use
 * standalone "qty days" lines (broken multi-line layouts).
 */
function extractQuantityFromConsignees(text) {
    let total = 0;
    let matchedRows = 0;
    const sectionStarts = [...text.matchAll(TENDER_DETAIL_REGEXES.CONSIGNEES_SECTION)]
        .map((match) => match.index)
        .filter((index) => index != null);

    for (let i = 0; i < sectionStarts.length; i += 1) {
        const sectionStart = sectionStarts[i];
        const nextStart = sectionStarts[i + 1] ?? text.length;
        const section = text.slice(sectionStart, Math.min(nextStart, sectionStart + 8000));

        let sectionTotal = 0;
        let sectionRows = 0;

        for (const match of section.matchAll(TENDER_DETAIL_REGEXES.CONSIGNEE_QTY_ROW)) {
            const quantity = parseQuantityNumber(match[1]);
            const deliveryDays = parseQuantityNumber(match[2]);
            if (quantity <= 0 || deliveryDays <= 0 || deliveryDays > 3650) {
                continue;
            }
            sectionTotal += quantity;
            sectionRows += 1;
        }

        if (!sectionRows) {
            for (const match of section.matchAll(TENDER_DETAIL_REGEXES.CONSIGNEE_QTY_DAYS_ONLY)) {
                const quantity = parseQuantityNumber(match[1]);
                const deliveryDays = parseQuantityNumber(match[2]);
                if (quantity <= 0 || deliveryDays <= 0 || deliveryDays > 3650) {
                    continue;
                }
                sectionTotal += quantity;
                sectionRows += 1;
            }
        }

        if (sectionRows) {
            total += sectionTotal;
            matchedRows += sectionRows;
        }
    }

    return matchedRows ? total : 0;
}

/**
 * Way 5: Manpower "Number of Resources to be hired" rows
 * (headers are often column-split across lines in pdftotext).
 */
function extractQuantityFromResources(text) {
    if (
        !TENDER_DETAIL_REGEXES.RESOURCE_HIRE_MARKERS.test(text) &&
        !(/Resources\s+to/i.test(text) && /be\s+hired/i.test(text))
    ) {
        return 0;
    }

    let total = 0;
    let matched = 0;
    for (const match of text.matchAll(TENDER_DETAIL_REGEXES.RESOURCE_QTY_ROW)) {
        const quantity = parseQuantityNumber(match[1]);
        if (quantity <= 0) {
            continue;
        }
        total += quantity;
        matched += 1;
    }

    return matched ? total : 0;
}

/**
 * Way 6: Service/AMC consignee columns — "Number of each Asset for AMC",
 * "Number of Devices", "Quantity of Data Center Assets", etc.
 */
function extractQuantityFromServiceConsignees(text) {
    let total = 0;
    let matchedRows = 0;
    const sectionStarts = [...text.matchAll(TENDER_DETAIL_REGEXES.CONSIGNEES_SECTION)]
        .map((match) => match.index)
        .filter((index) => index != null);

    for (let i = 0; i < sectionStarts.length; i += 1) {
        const sectionStart = sectionStarts[i];
        const nextStart = sectionStarts[i + 1] ?? text.length;
        const section = text.slice(sectionStart, Math.min(nextStart, sectionStart + 8000));
        if (!TENDER_DETAIL_REGEXES.SERVICE_CONSIGNEE_COLUMN.test(section)) {
            continue;
        }

        for (const match of section.matchAll(TENDER_DETAIL_REGEXES.SERVICE_CONSIGNEE_QTY_ROW)) {
            const quantity = parseQuantityNumber(match[1]);
            if (quantity <= 0) {
                continue;
            }
            total += quantity;
            matchedRows += 1;
        }
    }

    return matchedRows ? total : 0;
}

/**
 * Way 7: AMC/service item titles ending with "( N )" (not "pieces"),
 * including split title / "( N )" lines. Gated to AMC-style documents.
 */
function extractQuantityFromServiceItemTitles(text) {
    if (!TENDER_DETAIL_REGEXES.SERVICE_ITEM_DOC_MARKERS.test(text)) {
        return 0;
    }

    const lines = String(text || "")
        .split(/\n/)
        .map((line) => line.replace(/\f/g, "").trim());
    let total = 0;
    let matched = 0;

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line || /Additional Specification Parameters/i.test(line)) {
            continue;
        }

        let quantity = 0;
        let endIndex = i;

        const sameLine = line.match(TENDER_DETAIL_REGEXES.SERVICE_ITEM_PAREN_SAME);
        if (
            sameLine?.[1] &&
            !/pieces?/i.test(line) &&
            line.length >= 12 &&
            !TENDER_DETAIL_REGEXES.SERVICE_ITEM_PAREN_ONLY.test(line)
        ) {
            quantity = parseQuantityNumber(sameLine[1]);
        } else if (TENDER_DETAIL_REGEXES.SERVICE_ITEM_PAREN_ONLY.test(line)) {
            const only = line.match(TENDER_DETAIL_REGEXES.SERVICE_ITEM_PAREN_ONLY);
            const previous = [...lines.slice(0, i)].reverse().find(Boolean) || "";
            if (
                only?.[1] &&
                previous.length >= 12 &&
                !/pieces?/i.test(previous) &&
                !/Additional Specification Parameters/i.test(previous)
            ) {
                quantity = parseQuantityNumber(only[1]);
            }
        } else if (
            TENDER_DETAIL_REGEXES.SERVICE_ITEM_PAREN_OPEN.test(line) &&
            i + 1 < lines.length
        ) {
            const next = lines[i + 1].match(TENDER_DETAIL_REGEXES.SERVICE_ITEM_PAREN_CLOSE);
            if (next?.[1] && line.length >= 12) {
                quantity = parseQuantityNumber(next[1]);
                endIndex = i + 1;
            }
        }

        if (quantity <= 0) {
            continue;
        }

        const following = lines
            .slice(endIndex + 1, endIndex + 8)
            .filter(Boolean)
            .join("\n");
        if (!/Technical Specifications/i.test(following)) {
            continue;
        }

        total += quantity;
        matched += 1;
        i = endIndex;
    }

    return matched ? total : 0;
}

/** Way 8: ATC tables with "13.0 Nos." near a QTY header. */
function extractQuantityFromNosTable(text) {
    const qtyHeaderIndex = text.search(/\bQTY\b/i);
    if (qtyHeaderIndex < 0) {
        return 0;
    }

    const window = text.slice(qtyHeaderIndex, qtyHeaderIndex + 800);
    let total = 0;
    let matched = 0;
    for (const match of window.matchAll(TENDER_DETAIL_REGEXES.ATC_QTY_NOS)) {
        const quantity = parseQuantityNumber(match[1]);
        if (quantity <= 0) {
            continue;
        }
        total += quantity;
        matched += 1;
    }

    return matched ? total : 0;
}

/**
 * Sequential quantity extraction — first positive hit wins.
 * Falls back to 0 when none of the layouts match (e.g. lumpsum services).
 */
function extractQuantity(text) {
    const normalized = String(text || "").replace(/\u00a0/g, " ");
    const strategies = [
        extractQuantityFromTotalLabel,
        extractQuantityFromItemPieces,
        extractQuantityFromBidQuantity,
        extractQuantityFromConsignees,
        extractQuantityFromResources,
        extractQuantityFromServiceConsignees,
        extractQuantityFromServiceItemTitles,
        extractQuantityFromNosTable,
    ];

    for (const strategy of strategies) {
        const quantity = strategy(normalized);
        if (quantity > 0) {
            return quantity;
        }
    }

    return 0;
}

function firstMoneyInWindow(window, { fromEnd = false } = {}) {
    const matches = [...String(window || "").matchAll(TENDER_DETAIL_REGEXES.EMD_MONEY_NUMBER)];
    const ordered = fromEnd ? matches.reverse() : matches;
    for (const match of ordered) {
        const amount = parseMoneyAmount(match[1]);
        // GeM EMDs are currency amounts; ignore tiny page/serial numbers.
        if (amount >= 100) {
            return amount;
        }
    }
    return 0;
}

/**
 * EMD amount from the GeM "EMD Detail" block.
 * - Required No → 0
 * - Single "EMD Amount N" → N
 * - Multi-schedule rows → sum of schedule amounts
 * Handles split layouts where the number sits before or after the label.
 */
function extractEmdAmount(text) {
    const normalized = String(text || "")
        .replace(/\u00a0/g, " ")
        .replace(/\f/g, "\n");

    const detailMatch = normalized.match(TENDER_DETAIL_REGEXES.EMD_DETAIL);
    let section = normalized;
    if (detailMatch?.index != null) {
        const start = detailMatch.index + detailMatch[0].length;
        const rest = normalized.slice(start);
        const endMatch = rest.match(TENDER_DETAIL_REGEXES.EMD_SECTION_END);
        const end = endMatch?.index != null ? start + endMatch.index : start + 3000;
        section = normalized.slice(start, end);
    }

    const hasAmountLabel =
        /\/\s*EMD\b/i.test(section) || /EMD\s*Amount/i.test(section);
    if (TENDER_DETAIL_REGEXES.EMD_REQUIRED_NO.test(section) && !hasAmountLabel) {
        return 0;
    }

    const amounts = [];
    for (const match of section.matchAll(TENDER_DETAIL_REGEXES.EMD_AMOUNT_LABEL)) {
        const labelStart = match.index ?? 0;
        const windowStart = Math.max(0, labelStart);
        if (
            TENDER_DETAIL_REGEXES.EMD_APPLICABLE_PROSE.test(
                section.slice(windowStart, windowStart + 80),
            )
        ) {
            continue;
        }
        const after = section.slice(labelStart + match[0].length, labelStart + match[0].length + 120);
        const before = section.slice(Math.max(0, labelStart - 100), labelStart);
        const amount = firstMoneyInWindow(after) || firstMoneyInWindow(before, { fromEnd: true });
        if (amount > 0) {
            amounts.push(amount);
        }
    }

    for (const match of normalized.matchAll(TENDER_DETAIL_REGEXES.EMD_AMOUNT_IS)) {
        const amount = parseMoneyAmount(match[1]);
        if (amount > 0) {
            amounts.push(amount);
        }
    }

    if (!amounts.length) {
        return 0;
    }

    // Collapse consecutive duplicate hits from overlapping "/EMD" + "EMD Amount" labels.
    const collapsed = [];
    for (const amount of amounts) {
        if (!collapsed.length || collapsed[collapsed.length - 1] !== amount) {
            collapsed.push(amount);
        }
    }

    const unique = new Set(collapsed);
    if (unique.size === 1) {
        return collapsed[0];
    }
    return collapsed.reduce((sum, amount) => sum + amount, 0);
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
        emd_amount: extractEmdAmount(text),
    };
};

function sameDateTime(left, right) {
    return toDbDateTime(left) === toDbDateTime(right);
}

function normalizeScanText(value) {
    if (value == null) {
        return "";
    }
    return String(value).trim();
}

function sameScanText(left, right) {
    return normalizeScanText(left) === normalizeScanText(right);
}

function sameScanNumber(left, right) {
    const leftNumber = Number(left || 0);
    const rightNumber = Number(right || 0);
    const safeLeft = Number.isFinite(leftNumber) ? leftNumber : 0;
    const safeRight = Number.isFinite(rightNumber) ? rightNumber : 0;
    return safeLeft === safeRight;
}

function normalizeSpecificationLinks(value) {
    if (value == null || value === "") {
        return [];
    }
    if (Array.isArray(value)) {
        return value
            .filter((item) => item && item.url)
            .map((item) => ({
                url: String(item.url).trim(),
                label: item.label != null ? String(item.label).trim() : "",
            }))
            .sort((left, right) => left.url.localeCompare(right.url));
    }
    if (typeof value === "string") {
        try {
            return normalizeSpecificationLinks(JSON.parse(value));
        } catch {
            return [];
        }
    }
    return [];
}

function sameSpecificationLinks(left, right) {
    return (
        JSON.stringify(normalizeSpecificationLinks(left)) ===
        JSON.stringify(normalizeSpecificationLinks(right))
    );
}

function hasSpecificationLinks(value) {
    return normalizeSpecificationLinks(value).length > 0;
}

const SCAN_DETAIL_FIELDS = [
    "document",
    "start_date_time",
    "end_date_time",
    "ministry",
    "department",
    "organization",
    "office",
    "hod_email",
    "buyer_email",
    "buyer_phone",
    "required_minimum_average_turnover",
    "required_past_experice_years",
    "mse_experience_relaxation",
    "mse_turnover_relaxation",
    "asked_documents",
    "specification_links",
    "quantity",
    "emd_amount",
];

function preferPositiveNumber(nextValue, existingValue) {
    const nextNumber = Number(nextValue || 0);
    const existingNumber = Number(existingValue || 0);
    if (Number.isFinite(nextNumber) && nextNumber > 0) {
        return nextNumber;
    }
    if (Number.isFinite(existingNumber) && existingNumber > 0) {
        return existingNumber;
    }
    return 0;
}

function buildScanDetailsForUpsert({ document, gemTenderDetails, existingTender = null }) {
    const nextSpecificationLinks = hasSpecificationLinks(gemTenderDetails.specification_links)
        ? gemTenderDetails.specification_links
        : existingTender
          ? normalizeSpecificationLinks(existingTender.specification_links)
          : gemTenderDetails.specification_links;

    return {
        document: document || existingTender?.document || null,
        start_date_time: gemTenderDetails.start_date_time,
        end_date_time: gemTenderDetails.end_date_time,
        ministry: gemTenderDetails.ministry,
        department: gemTenderDetails.department,
        organization: gemTenderDetails.organization,
        office: gemTenderDetails.office,
        hod_email: gemTenderDetails.hod_email,
        buyer_email: gemTenderDetails.buyer_email,
        buyer_phone: gemTenderDetails.buyer_phone,
        required_minimum_average_turnover:
            gemTenderDetails.required_minimum_average_turnover,
        required_past_experice_years: gemTenderDetails.required_past_experice_years,
        mse_experience_relaxation: gemTenderDetails.mse_experience_relaxation,
        mse_turnover_relaxation: gemTenderDetails.mse_turnover_relaxation,
        asked_documents: gemTenderDetails.asked_documents,
        specification_links: nextSpecificationLinks,
        quantity: preferPositiveNumber(
            gemTenderDetails.quantity,
            existingTender?.quantity,
        ),
        emd_amount: preferPositiveNumber(
            gemTenderDetails.emd_amount,
            existingTender?.emd_amount,
        ),
    };
}

function scanDetailsDiffer(existingTender, nextDetails) {
    for (const field of SCAN_DETAIL_FIELDS) {
        const existingValue = existingTender?.[field];
        const nextValue = nextDetails?.[field];

        if (field === "start_date_time" || field === "end_date_time") {
            if (!sameDateTime(existingValue, nextValue)) {
                return true;
            }
            continue;
        }

        if (field === "quantity" || field === "emd_amount") {
            if (!sameScanNumber(existingValue, nextValue)) {
                return true;
            }
            continue;
        }

        if (field === "specification_links") {
            if (!sameSpecificationLinks(existingValue, nextValue)) {
                return true;
            }
            continue;
        }

        if (!sameScanText(existingValue, nextValue)) {
            return true;
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

        const nextDetails = buildScanDetailsForUpsert({
            document,
            gemTenderDetails,
            existingTender,
        });

        if (!scanDetailsDiffer(existingTender, nextDetails)) {
            logger.info(`Tender unchanged, skipping update: ${tender_id}`);
            return false;
        }

        await updateGemKeywordTenderScanDetailsById({
            id: existingTender.id,
            ...nextDetails,
        });

        logger.info(`Updated tender scan details: ${tender_id}`);
        return true;
    } catch (error) {
        logger.error(`Failed to process tender ${tender_id}: ${error}`);
        return false;
    }
};

export const searchTendersByKeyword = async (
    driver,
    { keyword, id: keyword_id = null, exact_search = false },
) => {
    const searchKeyword = String(keyword || "").trim();
    const resolvedKeywordId =
        keyword_id != null && Number(keyword_id) >= 1 ? Number(keyword_id) : null;
    if (!searchKeyword) {
        logger.info("No keyword configured, skipping search.");
        return 0;
    }

    await ensureTenderStorage();

    const page = new GemPage(driver, GEM_URL);

    await page.open();

    if (exact_search) {
        logger.info(`Exact search enabled for keyword: ${searchKeyword}`);
        await page.clickElement(await page.searchTypeDropdown());
        await page.clickElement(await page.exactSearchOption());
    } else {
        logger.info(`Contains/default search for keyword: ${searchKeyword}`);
    }

    const searchInput = await page.searchInput();
    await searchInput.clear();
    await searchInput.sendKeys(searchKeyword);

    await page.clickElement(await page.searchButton());
    await sleep(driver, DELAY_MEDIUM);
    await page.bidCardContainer();

    if (!(await page.isPaginationVisible())) {
        logger.info(`No tenders found for keyword: ${searchKeyword}`);
        return 0;
    }

    const lastPage = await page.getLastPageNumber();
    let changedCount = 0;

    for (let pageNumber = 1; pageNumber <= lastPage; pageNumber++) {
        logger.info(`Downloading page ${pageNumber} of ${lastPage} for ${searchKeyword}...`);

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
                    keyword_id: resolvedKeywordId,
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
