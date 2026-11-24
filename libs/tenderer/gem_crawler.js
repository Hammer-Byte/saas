import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { logger } from "@hammerbyte/utils";
import { toDbDateTime } from "../date.js";
import { GEM_SEARCH_MODES, GemAllBidsPage, GemPage } from "./gem_pom.js";
import {
    createGemTender,
    getAllGemTenderIds,
    updateGemTenderScanDetailsById,
} from "../../db/gem_tenders.js";
import {
    enrichSpecificationLinksWithMedia,
    ensureBidDocumentMedia,
} from "../gem_tender_source_files.js";

const DELAY_SHORT = 1000;

const GEM_URL = "https://bidplus.gem.gov.in";
const TENDERS_DIRECTORY = "downloaded_tenders";
const GEM_BID_NUMBER = /^GEM\/\d{4}\/B\/\d+$/i;
const GEM_RA_NUMBER = /^GEM\/\d{4}\/R\/\d+$/i;

/**
 * Per-property ordered regex lists. Scan tries each pattern in order and stops
 * at the first capture (group 1 unless noted). More patterns = higher hit rate.
 */
const PROPERTY_REGEXES = {
    end_date_time: [
        /Bid End Date\/Time\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/,
        /RA End Date\/Time\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/,
    ],
    start_date_time: [
        // Most common GeM layout: date sits between "Bid Opening" and "Date/Time".
        /Bid Opening[\s\S]{0,80}?(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})[\s\S]{0,40}?Date\/Time/i,
        /Bid Opening[\s\S]{0,40}?Date\/Time\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/i,
        /Bid Opening[\s\S]{0,120}?(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/i,
        /RA Start Date\/Time\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/,
    ],
    hod_email: [
        /HOD\s*Email\s*id\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /HOD[\s\S]{0,40}?Email\s*(?:id|ID)\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    ],
    buyer_email: [
        /Buyer\s*Email\s*id\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /Buyer[\s\S]{0,40}?Email\s*(?:id|ID)\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /Email\s*ID\s*:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    ],
    buyer_name: [
        /(?:Buyer\s*Name|Name\s*of\s*(?:the\s*)?Buyer)\s*:?\s*([^\n|;]+)/i,
        /(?:^|\||\n)\s*(?:पद\s*\|)?Designation\s*:\s*([^\n|;]+)/i,
    ],
    buyer_phone: [
        /Contact\s*No\.?\s*:\s*([0-9][0-9\-\s/]{6,24})/i,
        /(?:Mobile|Phone)\s*(?:No\.?|Number)?\s*:?\s*([0-9][0-9\-\s+/]{6,24})/i,
    ],
    required_minimum_average_turnover: [
        /Minimum Average Annual Turnover[\s\S]{0,120}?(\d+(?:\.\d+)?\s*Lakh\s*\(s\))/i,
        // GeM often puts the value between "Annual" and "Turnover of the bidder".
        /Minimum Average Annual\s+(\d+(?:\.\d+)?\s*Lakh\s*\(s\))\s*Turnover/i,
        /Minimum Average Annual[\s\S]{0,60}?(\d+(?:\.\d+)?\s*Lakh\s*\(s\))[\s\S]{0,60}?Turnover of the bidder/i,
        /Minimum Average Annual\s+(\d+(?:\.\d+)?\s*Crore\s*\(s\))\s*Turnover/i,
        /Minimum Average Annual Turnover[\s\S]{0,120}?(\d+(?:\.\d+)?\s*Crore\s*\(s\))/i,
        // OEM turnover value often appears on the line above the English label.
        /(\d+(?:\.\d+)?\s*Lakh\s*\(s\))[\s\S]{0,100}?OEM Average Turnover\s*\(Last 3 Years\)/i,
        /OEM Average Turnover\s*\(Last 3 Years\)[\s\S]{0,100}?(\d+(?:\.\d+)?\s*Lakh\s*\(s\))/i,
        /(\d+(?:\.\d+)?\s*Crore\s*\(s\))[\s\S]{0,100}?OEM Average Turnover\s*\(Last 3 Years\)/i,
    ],
    required_past_experice_years: [
        /Years of Past Experience Required[\s\S]{0,80}?(\d+\s*Year\s*\(s\))/i,
        /Years of Past Experience Required for[\s\S]{0,40}?(\d+\s*Year\s*\(s\))/i,
        /Past Experience Required for[\s\S]{0,40}?(\d+\s*Year\s*\(s\))/i,
        /Years of Past Experience Required[\s\S]{0,100}?(\d+)\s*Year/i,
        /Years of Past Experience required[\s\S]{0,80}?(\d+)\s*(?:years?|Year)/i,
    ],
    // Global + last match: GeM often repeats the row; final Bid Details hit wins.
    mse_experience_relaxation: [
        /MSE Relaxation for Years Of Experience[\s\S]{0,40}?(?<![A-Za-z])((?:Yes|No)(?:\s*\|\s*(?:Complete|All|Partial))?)(?![A-Za-z])/gi,
        /(?:MSE|\u090F\u092E\u090F\u0938\u0908|\u090F\u092E\s*\u090F\u0938\s*\u0908)(?!\s+Purchase)[\s\S]{0,120}?(?<![A-Za-z])((?:Yes|No)(?:\s*\|\s*(?:Complete|All|Partial))?)(?![A-Za-z])/gi,
    ],
    mse_turnover_relaxation: [
        /Startup Relaxation for Years Of[\s\S]{0,60}?(?<![A-Za-z])((?:Yes|No)(?:\s*\|\s*(?:Complete|All|Partial))?)(?![A-Za-z])/gi,
        /(?:Startup|Start-up|\u0938\u094D\u091F\u093E\u0930\u094D\u091F\u0905\u092A|\u0938\u094D\u091F\u093E\u0930\u094D\u091F[\s-]*\u0905\u092A)[\s\S]{0,120}?(?<![A-Za-z])((?:Yes|No)(?:\s*\|\s*(?:Complete|All|Partial))?)(?![A-Za-z])/gi,
    ],
    scope_of_work_file: [
        /Scope\s+of\s+Work\s*:?\s*([0-9]+\.pdf)/gi,
        /Scope\s*Of\s*Work\s*\(?SOW\)?\s*:?\s*([0-9]+\.pdf)/gi,
        /Scope\s+of\s+Work\s*:?\s*([A-Za-z0-9._-]+\.pdf)/gi,
        /(?:SOW|S\.O\.W\.?)\s*:?\s*([0-9]+\.pdf)/gi,
        /(?:Additional\s+)?(?:Scope|Specification)\s+(?:of\s+Work\s+)?Document\s*:?\s*([0-9A-Za-z._-]+\.pdf)/gi,
        /Scope\s+of\s+Work\s*:?\s*([0-9A-Za-z._-]+\.(?:docx?|pdf))/gi,
    ],
    /** URI path / query snippets matched against embedded GeM links (order = preference). */
    specification_document_uri: [
        /Scopework_/i,
        /\/SOW_/i,
        /SCOPE_ATC_/i,
        /fileDownloadPath=/i,
        /SpecificationDocument/i,
        /downloadBuyerDoc/i,
        /\/swspec_/i,
        /\/BoqDocument\/[^?\s]+\.pdf/i,
        /AdditionalSpecification/i,
        /BuyerDoc/i,
        /catalogueDocs/i,
        /upload_nas\/[^?\s]+\/biddoc\//i,
        /slafds\?/i,
        /downloadFile/i,
    ],
    quantity: [
        /Total\s*(?:Quantity|Qty)\s*[:=\u00a0\-]*([\d,]+(?:\.\d+)?)/i,
        /Total\s*(?:Quantity|Qty)[^\d\n]{0,80}\n[^\d\n]{0,40}([\d,]+(?:\.\d+)?)/i,
        /\bBid\s*(?:Quantity|Qty)\s*[:=\-]?\s*([\d,]+(?:\.\d+)?)/i,
        /Total\s*Qty\.?\s*[:=\-]?\s*([\d,]+(?:\.\d+)?)/i,
        /Quantity\s*\(Nos\.?\)\s*[:=\-]?\s*([\d,]+(?:\.\d+)?)/i,
        /\bQty\.?\s*[:=\-]\s*([\d,]+(?:\.\d+)?)/i,
        /मा\s*ा\s*\/\s*Quantity[^\d]{0,40}([\d,]+(?:\.\d+)?)/i,
        /\(\s*([\d,]+)\s*Nos\.?\s*\)/i,
        /\(\s*([\d,]+)\s*(?:pieces?|units?)\s*\)/i,
    ],
    /** Direct EMD amount captures (tried before section-window logic). */
    emd_amount: [
        /EMD\s*Amount\s*[:=\-]?\s*([\d,]+(?:\.\d+)?)/i,
        /\/\s*EMD\s*[:=\-]?\s*([\d,]+(?:\.\d+)?)/i,
        /EMD\s*AMOUNT\s+IS\s+([\d,]+(?:\.\d+)?)\s*INR/i,
        /Earnest\s+Money\s+Deposit\s*[:=\-]?\s*(?:Rs\.?|INR)?\s*([\d,]+(?:\.\d+)?)/i,
        /ईएमड[^\n\/]{0,12}\/\s*EMD\s*Amount\s*[:=\-]?\s*([\d,]+(?:\.\d+)?)/i,
        /EMD\s*Amount\s*[:=\-]?\s*Rs\.?\s*([\d,]+(?:\.\d+)?)/i,
        /EMD\s*\(INR\)\s*[:=\-]?\s*([\d,]+(?:\.\d+)?)/i,
    ],
    emd_detail: [/EMD\s*Detail/i, /ईएमड\s*ववरण\s*\/\s*EMD\s*Detail/i],
    emd_section_end: [
        /ePBG\s*Detail/i,
        /ईपीबीजी\s*ववरण\s*\/\s*ePBG\s*Detail/i,
        /Bid\s+splitting/i,
        /MII\s+Purchase/i,
        /MSE\s+Purchase/i,
    ],
    emd_required_no: [/Required\s+No/i, /आव\s*यकता\s*\/\s*Required\s+No/i],
    emd_amount_label: [
        /EMD\s*Amount/gi,
        /\/\s*EMD\b/gi,
        /ईएमड[^\n\/]{0,12}\/\s*EMD\s*Amount/gi,
    ],
};

/** Structural / multi-step helpers (not simple first-capture properties). */
const TENDER_DETAIL_REGEXES = {
    EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    /** GeM list card with Bid No → RA No — skip whole card. */
    RA_CARD_NO: /RA\s*NO\s*:/i,
    BID_CARD_NO: /Bid\s*No\.?\s*:/i,
    BUYER_DETAILS_SECTION:
        /Buyer\s*Details([\s\S]{0,5000}?)(?:Seller\s*Details|Product\s*Details|$)/i,
    YES_FLAG: /^\s*Yes/i,
    NO_FLAG: /^\s*No/i,
    DOCUMENT_REQUIRED: /Document required/i,
    ASKED_DOCUMENTS:
        /((?:Experience Criteria|Bidder Turnover|Certificate \(Requested in ATC\)|OEM Authorization Certificate|Additional Doc \d+ \(Requested in ATC\)|OEM Annual Turnover)(?:,\s*(?:Experience Criteria|Bidder Turnover|Certificate \(Requested in ATC\)|OEM Authorization Certificate|Additional Doc \d+ \(Requested in ATC\)|OEM Annual Turnover))*)/,
    SKIP_VALUE: /Years of Past Experience|MSE|Startup|Document required/i,
    DEVANAGARI_START: /^[\u0900-\u097F]/,
    // Complex quantity layouts (summing / table strategies after PROPERTY_REGEXES.quantity).
    ITEM_PIECES_LINE: /^.{0,160}?\(\s*([\d,]+)\s*(?:pieces?|units?)\s*\)\s*$/i,
    ITEM_PIECES_ONLY: /^\(\s*([\d,]+)\s*(?:pieces?|units?)\s*\)$/i,
    CONSIGNEES_SECTION: /Consignees\/Reporting Officer(?:\s+and\s+Quantity)?/gi,
    CONSIGNEE_QTY_ROW: /^\s*\d+\s+.+\s+(\d{1,7})\s+(\d{1,4})\s*$/gm,
    CONSIGNEE_QTY_DAYS_ONLY: /^\s*(\d{1,7})\s+(\d{1,4})\s*$/gm,
    SERVICE_CONSIGNEE_COLUMN:
        /\/\s*Number of|\/\s*Quantity of|each\s+Asset|for\s+AMC|Number of Devices|Resources\s+to/i,
    SERVICE_CONSIGNEE_QTY_ROW:
        /^\s*\d+\s+[A-Za-z*][^\n/]{3,}?\s+(\d{1,7})\s*(?:Resident engineers|N\/A)?\s*$/gm,
    RESOURCE_HIRE_MARKERS: /Resources\s+to[\s\S]{0,80}?be\s+hired/i,
    RESOURCE_QTY_ROW:
        /^\s*\d+\s+[^\n]*?\*{3,}[^\n]*?\*{3,}[^\n]*?\s+(\d{1,6})\b/gm,
    SERVICE_ITEM_DOC_MARKERS:
        /Annual Maintenance|Maintenance Contract|each\s+Asset|for\s+AMC|Networking Devices|Custom Bid for Services|Hiring of Agency|Milestone basis|SLA Based|OFC Maintenance|GlobalTenderCategory|Ambulance|Systems\/Equipments/i,
    SERVICE_ITEM_PAREN_SAME: /\(\s*([\d,]+)\s*\)\s*$/,
    SERVICE_ITEM_PAREN_ONLY: /^\(\s*([\d,]+)\s*\)$/,
    SERVICE_ITEM_PAREN_OPEN: /\(\s*$/,
    SERVICE_ITEM_PAREN_CLOSE: /^([\d,]+)\s*\)$/,
    ATC_QTY_NOS: /\b([\d,]+(?:\.\d+)?)\s*Nos\.?\b/gi,
    EMD_MONEY_NUMBER: /([\d,]{2,}(?:\.\d+)?)/g,
    EMD_APPLICABLE_PROSE: /will\s+be\s+applicable/i,
};

/** Try each regex in order; return first non-empty capture (default group 1). */
function firstCaptureFromRegexList(text, patterns, { group = 1, pick = "first" } = {}) {
    const source = String(text || "");
    if (!Array.isArray(patterns) || !patterns.length) {
        return null;
    }
    for (const pattern of patterns) {
        if (!pattern) continue;
        if (pick === "last" || pattern.global) {
            const flags = pattern.flags.includes("g")
                ? pattern.flags
                : `${pattern.flags}g`;
            const globalRe = new RegExp(pattern.source, flags);
            const matches = [...source.matchAll(globalRe)];
            const chosen = pick === "last" ? matches.at(-1) : matches[0];
            const value = chosen?.[group];
            if (value != null && String(value).trim()) {
                return String(value).replace(/\s+/g, " ").trim();
            }
            continue;
        }
        const match = source.match(pattern);
        const value = match?.[group];
        if (value != null && String(value).trim()) {
            return String(value).replace(/\s+/g, " ").trim();
        }
    }
    return null;
}

/** Collect all non-empty captures across every pattern (for multi-file SoW labels). */
function allCapturesFromRegexList(text, patterns, { group = 1 } = {}) {
    const source = String(text || "");
    const values = [];
    const seen = new Set();
    for (const pattern of patterns || []) {
        if (!pattern) continue;
        const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
        const globalRe = new RegExp(pattern.source, flags);
        for (const match of source.matchAll(globalRe)) {
            const value = match?.[group];
            if (value == null) continue;
            const normalized = String(value).replace(/\s+/g, " ").trim();
            if (!normalized || seen.has(normalized.toLowerCase())) continue;
            seen.add(normalized.toLowerCase());
            values.push(normalized);
        }
    }
    return values;
}

const sleep = (driver, ms) => driver.sleep(ms);

const tenderFileName = (tenderId) =>
    `${Buffer.from(String(tenderId), "utf8").toString("base64url")}.pdf`;

async function ensureTenderStorage() {
    await mkdir(TENDERS_DIRECTORY, { recursive: true });
}

async function removeLocalTenderPdf(tenderFile, tenderId = null) {
    if (!tenderFile) {
        return;
    }
    const label = tenderId || tenderFile;
    try {
        await unlink(tenderFile);
        logger.info(`Deleted local tender PDF after processing: ${label}`);
    } catch (error) {
        if (error?.code === "ENOENT") {
            logger.info(`Local tender PDF already absent after processing: ${label}`);
            return;
        }
        logger.error(`Failed to delete local tender PDF ${label}: ${error}`);
    }
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
    await page.waitForSearchSettled();
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

/** "Yes | Complete" / "Yes | All" / "Yes | Partial" / "Yes" → true; "No…" → false; missing → null. */
function parseYesNoFlag(value) {
    const text = cleanValue(value);
    if (!text) {
        return null;
    }
    if (TENDER_DETAIL_REGEXES.YES_FLAG.test(text)) {
        return true;
    }
    if (TENDER_DETAIL_REGEXES.NO_FLAG.test(text)) {
        return false;
    }
    return null;
}

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

function normalizePhoneValue(value) {
    const raw = cleanValue(value);
    if (!raw) return null;
    // Keep digits; drop trailing separators from PDF layout (e.g. "09925-582147-").
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length < 10) return null;
    if (digits.length === 10) return digits;
    if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    if (digits.length > 12) return digits.slice(-10);
    return digits;
}

function buyerDetailsBlock(text) {
    const match = String(text || "").match(TENDER_DETAIL_REGEXES.BUYER_DETAILS_SECTION);
    return match?.[1] || "";
}

function extractBuyerContactFields(text) {
    const source = String(text || "");
    const buyerBlock = buyerDetailsBlock(source);

    const hod_email =
        firstCaptureFromRegexList(source, PROPERTY_REGEXES.hod_email) || null;

    const buyer_email =
        firstCaptureFromRegexList(source, PROPERTY_REGEXES.buyer_email) ||
        firstCaptureFromRegexList(buyerBlock, PROPERTY_REGEXES.buyer_email) ||
        null;

    // Only read phones from Buyer Details so Seller / consignee numbers are ignored.
    const buyer_phone =
        normalizePhoneValue(
            firstCaptureFromRegexList(buyerBlock, PROPERTY_REGEXES.buyer_phone),
        ) || null;

    // Prefer explicit buyer name; contract PDFs usually only expose Designation.
    const buyer_name =
        firstCaptureFromRegexList(source, PROPERTY_REGEXES.buyer_name) ||
        firstCaptureFromRegexList(buyerBlock, PROPERTY_REGEXES.buyer_name) ||
        null;

    return { hod_email, buyer_email, buyer_phone, buyer_name };
}

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

function uriMatchesSpecificationPatterns(uri) {
    const value = String(uri || "");
    for (const pattern of PROPERTY_REGEXES.specification_document_uri || []) {
        if (pattern.test(value)) {
            return true;
        }
    }
    return false;
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

    const scopeFiles = allCapturesFromRegexList(
        pdfText,
        PROPERTY_REGEXES.scope_of_work_file,
    );

    for (const fileName of scopeFiles) {
        const matchedUri = uris.find((uri) =>
            uri.toLowerCase().includes(String(fileName).toLowerCase()),
        );
        if (matchedUri) {
            pushLink(`Scope of Work: ${fileName}`, matchedUri);
        }
    }

    // Ordered URI patterns from PROPERTY_REGEXES — collect matching GeM docs for AI/SoW.
    for (const uri of uris) {
        if (!uriMatchesSpecificationPatterns(uri)) {
            continue;
        }
        // Skip generic GTC / OM policy downloads — not tender SoW.
        if (/pdfByDate|downloadOmppdfile|gtc\/pdf/i.test(uri)) {
            continue;
        }
        let label = "Scope of Work / Specification Document";
        if (/Scopework_|\/SOW_|SCOPE_ATC_|scope.?of.?work/i.test(uri)) {
            label = "Scope of Work";
        } else if (/BoqDocument|\/boq/i.test(uri)) {
            label = "BOQ Document";
        } else if (scopeFiles.length) {
            label = "Buyer Specification Document";
        }
        pushLink(label, uri);
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
 * Sequential quantity extraction — PROPERTY_REGEXES.quantity first (first hit wins),
 * then complex table/summing strategies. Falls back to 0 when none match.
 */
function extractQuantity(text) {
    const normalized = String(text || "").replace(/\u00a0/g, " ");

    for (const pattern of PROPERTY_REGEXES.quantity || []) {
        const match = normalized.match(pattern);
        const quantity = parseQuantityNumber(match?.[1]);
        if (quantity > 0) {
            return quantity;
        }
    }

    const strategies = [
        extractQuantityFromItemPieces,
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

function firstMatchingPattern(text, patterns) {
    const source = String(text || "");
    for (const pattern of patterns || []) {
        const match = source.match(pattern);
        if (match) {
            return match;
        }
    }
    return null;
}

/**
 * EMD amount — PROPERTY_REGEXES.emd_amount first (direct captures), then EMD Detail
 * section label-window logic with ordered label regexes.
 */
function extractEmdAmount(text) {
    const normalized = String(text || "")
        .replace(/\u00a0/g, " ")
        .replace(/\f/g, "\n");

    const detailMatch = firstMatchingPattern(normalized, PROPERTY_REGEXES.emd_detail);
    let section = normalized;
    if (detailMatch?.index != null) {
        const start = detailMatch.index + detailMatch[0].length;
        const rest = normalized.slice(start);
        const endMatch = firstMatchingPattern(rest, PROPERTY_REGEXES.emd_section_end);
        const end = endMatch?.index != null ? start + endMatch.index : start + 3000;
        section = normalized.slice(start, end);
    }

    const hasAmountLabel = (PROPERTY_REGEXES.emd_amount_label || []).some((pattern) => {
        const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
        re.lastIndex = 0;
        return re.test(section);
    });
    const requiredNo = (PROPERTY_REGEXES.emd_required_no || []).some((pattern) =>
        pattern.test(section),
    );
    if (requiredNo && !hasAmountLabel) {
        return 0;
    }

    // Direct captures first (ordered list).
    for (const pattern of PROPERTY_REGEXES.emd_amount || []) {
        const match = section.match(pattern) || normalized.match(pattern);
        const amount = parseMoneyAmount(match?.[1]);
        if (amount >= 100) {
            return amount;
        }
        if (amount > 0 && amount < 100) {
            // Tiny amounts are rare; keep looking via label windows.
            continue;
        }
    }

    const amounts = [];
    for (const labelPattern of PROPERTY_REGEXES.emd_amount_label || []) {
        const flags = labelPattern.flags.includes("g")
            ? labelPattern.flags
            : `${labelPattern.flags}g`;
        const globalLabel = new RegExp(labelPattern.source, flags);
        for (const match of section.matchAll(globalLabel)) {
            const labelStart = match.index ?? 0;
            if (
                TENDER_DETAIL_REGEXES.EMD_APPLICABLE_PROSE.test(
                    section.slice(labelStart, labelStart + 80),
                )
            ) {
                continue;
            }
            const after = section.slice(
                labelStart + match[0].length,
                labelStart + match[0].length + 120,
            );
            const before = section.slice(Math.max(0, labelStart - 100), labelStart);
            const amount =
                firstMoneyInWindow(after) || firstMoneyInWindow(before, { fromEnd: true });
            if (amount > 0) {
                amounts.push(amount);
            }
        }
    }

    if (!amounts.length) {
        return 0;
    }

    // Collapse consecutive duplicate hits from overlapping labels.
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

/** GeM list card that shows Bid No → RA No (reverse auction listing). */
export function isReverseAuctionCard(cardText) {
    const text = String(cardText || "");
    if (TENDER_DETAIL_REGEXES.RA_CARD_NO.test(text)) {
        return true;
    }
    // Bid + RA number on the same card (arrow separator optional).
    return (
        TENDER_DETAIL_REGEXES.BID_CARD_NO.test(text) &&
        /GEM\/\d{4}\/R\//i.test(text)
    );
}

export const extractTenderDetails = (text, buffer) => {
    const end_date_time = firstCaptureFromRegexList(
        text,
        PROPERTY_REGEXES.end_date_time,
    );
    const start_date_time = firstCaptureFromRegexList(
        text,
        PROPERTY_REGEXES.start_date_time,
    );

    return {
        start_date_time,
        end_date_time,
        ministry: valueAfterLabel(text, "Ministry/State Name"),
        department: valueAfterLabel(text, "Department Name"),
        organization: valueAfterLabel(text, "Organisation Name"),
        office: valueAfterLabel(text, "Office Name"),
        ...extractBuyerContactFields(text),
        required_minimum_average_turnover: firstCaptureFromRegexList(
            text,
            PROPERTY_REGEXES.required_minimum_average_turnover,
        ),
        required_past_experice_years: firstCaptureFromRegexList(
            text,
            PROPERTY_REGEXES.required_past_experice_years,
        ),
        mse_experience_relaxation: parseYesNoFlag(
            firstCaptureFromRegexList(text, PROPERTY_REGEXES.mse_experience_relaxation, {
                pick: "last",
            }),
        ),
        mse_turnover_relaxation: parseYesNoFlag(
            firstCaptureFromRegexList(text, PROPERTY_REGEXES.mse_turnover_relaxation, {
                pick: "last",
            }),
        ),
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

/** DB stores TINYINT(1); scan produces true/false/null. */
function normalizeScanFlag(value) {
    if (value === true || value === 1 || value === "1") return 1;
    if (value === false || value === 0 || value === "0") return 0;
    return null;
}

function sameScanFlag(left, right) {
    return normalizeScanFlag(left) === normalizeScanFlag(right);
}

function sameScanNumber(left, right) {
    const leftNumber = Number(left || 0);
    const rightNumber = Number(right || 0);
    const safeLeft = Number.isFinite(leftNumber) ? leftNumber : 0;
    const safeRight = Number.isFinite(rightNumber) ? rightNumber : 0;
    return safeLeft === safeRight;
}

function normalizeSpecificationLinks(value, { keepMedia = false } = {}) {
    if (value == null || value === "") {
        return [];
    }
    if (Array.isArray(value)) {
        return value
            .filter((item) => item && item.url)
            .map((item) => {
                const link = {
                    url: String(item.url).trim(),
                    label: item.label != null ? String(item.label).trim() : "",
                };
                if (keepMedia) {
                    const mediaId = Number(item.media_id);
                    if (mediaId >= 1) {
                        link.media_id = mediaId;
                    }
                }
                return link;
            })
            .sort((left, right) => left.url.localeCompare(right.url));
    }
    if (typeof value === "string") {
        try {
            return normalizeSpecificationLinks(JSON.parse(value), { keepMedia });
        } catch {
            return [];
        }
    }
    return [];
}

function collectSpecificationMediaIds(value) {
    return normalizeSpecificationLinks(value, { keepMedia: true })
        .map((item) => Number(item.media_id))
        .filter((id) => id >= 1)
        .sort((a, b) => a - b);
}

function sameCachedMediaState(existingTender, nextDetails) {
    const existingBid = Number(existingTender?.document_media_id) || 0;
    const nextBid = Number(nextDetails?.document_media_id) || 0;
    if (existingBid !== nextBid) {
        return false;
    }
    const left = collectSpecificationMediaIds(existingTender?.specification_links).join(",");
    const right = collectSpecificationMediaIds(nextDetails?.specification_links).join(",");
    return left === right;
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
    "buyer_name",
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

function preferScanText(nextValue, existingValue) {
    const next = normalizeScanText(nextValue);
    if (next) return next;
    const existing = normalizeScanText(existingValue);
    return existing || null;
}

function buildScanDetailsForUpsert({
    document,
    document_media_id = null,
    gemTenderDetails,
    existingTender = null,
}) {
    const nextSpecificationLinks = hasSpecificationLinks(gemTenderDetails.specification_links)
        ? gemTenderDetails.specification_links
        : existingTender
          ? normalizeSpecificationLinks(existingTender.specification_links, {
                keepMedia: true,
            })
          : gemTenderDetails.specification_links;

    const documentMediaId =
        document_media_id != null && Number(document_media_id) >= 1
            ? Number(document_media_id)
            : existingTender?.document_media_id != null &&
                Number(existingTender.document_media_id) >= 1
              ? Number(existingTender.document_media_id)
              : null;

    return {
        document: document || existingTender?.document || null,
        document_media_id: documentMediaId,
        start_date_time: gemTenderDetails.start_date_time,
        end_date_time: gemTenderDetails.end_date_time,
        ministry: gemTenderDetails.ministry,
        department: gemTenderDetails.department,
        organization: gemTenderDetails.organization,
        office: gemTenderDetails.office,
        hod_email: preferScanText(gemTenderDetails.hod_email, existingTender?.hod_email),
        buyer_email: preferScanText(gemTenderDetails.buyer_email, existingTender?.buyer_email),
        buyer_phone: preferScanText(gemTenderDetails.buyer_phone, existingTender?.buyer_phone),
        buyer_name: preferScanText(gemTenderDetails.buyer_name, existingTender?.buyer_name),
        required_minimum_average_turnover:
            gemTenderDetails.required_minimum_average_turnover,
        required_past_experice_years: gemTenderDetails.required_past_experice_years,
        mse_experience_relaxation: normalizeScanFlag(gemTenderDetails.mse_experience_relaxation),
        mse_turnover_relaxation: normalizeScanFlag(gemTenderDetails.mse_turnover_relaxation),
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

        if (field === "mse_experience_relaxation" || field === "mse_turnover_relaxation") {
            if (!sameScanFlag(existingValue, nextValue)) {
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
    category_group_id = null,
    tender_category_id = null,
    tender_id,
    document = null,
    buffer = null,
    cookieHeader = "",
    existingTender = null,
}) => {
    let bidPromoted = false;
    try {
        const pdfBuffer = buffer || (await readFile(tenderFile));
        const pdfText = await readTenderText(tenderFile);
        const gemTenderDetails = extractTenderDetails(pdfText, pdfBuffer);
        const resolvedCategoryGroupId =
            category_group_id != null && Number(category_group_id) >= 1
                ? Number(category_group_id)
                : null;

        const resolvedTenderCategoryId =
            tender_category_id != null && Number(tender_category_id) >= 1
                ? Number(tender_category_id)
                : null;

        // After pdftotext, promote the same download into MEDIA (avoid rewrite + delete).
        const bidMedia = await ensureBidDocumentMedia({
            buffer: pdfBuffer,
            tenderFile,
            tenderId: tender_id,
            existingMediaId: existingTender?.document_media_id,
        });
        const document_media_id = bidMedia?.mediaId ?? null;
        bidPromoted = !!bidMedia?.promoted;

        const existingSpecLinks = normalizeSpecificationLinks(
            existingTender?.specification_links,
            { keepMedia: true },
        );
        const baseSpecLinks = hasSpecificationLinks(gemTenderDetails.specification_links)
            ? normalizeSpecificationLinks(gemTenderDetails.specification_links)
            : existingSpecLinks;

        gemTenderDetails.specification_links =
            (await enrichSpecificationLinksWithMedia({
                specificationLinks: baseSpecLinks,
                existingLinks: existingSpecLinks,
                cookieHeader,
                tenderId: tender_id,
            })) || null;

        // category_group_id / tender_category_id are set only on insert; never overwritten on re-scan.
        if (!existingTender) {
            const tenderRowId = await createGemTender({
                category_group_id: resolvedCategoryGroupId,
                tender_category_id: resolvedTenderCategoryId,
                tender_id,
                document,
                document_media_id,
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
            document_media_id,
            gemTenderDetails,
            existingTender,
        });

        const detailsChanged = scanDetailsDiffer(existingTender, nextDetails);
        const mediaChanged = !sameCachedMediaState(existingTender, nextDetails);
        if (!detailsChanged && !mediaChanged) {
            logger.info(`Tender unchanged, skipping update: ${tender_id}`);
            return false;
        }

        await updateGemTenderScanDetailsById({
            id: existingTender.id,
            ...nextDetails,
        });
        logger.info(`Updated tender scan details: ${tender_id}`);
        return true;
    } catch (error) {
        logger.error(`Failed to process tender ${tender_id}: ${error}`);
        return false;
    } finally {
        // Promoted download already lives under DIRECTORY_MEDIA; only clean leftover temp.
        if (!bidPromoted) {
            await removeLocalTenderPdf(tenderFile, tender_id);
        }
    }
};

export const searchTendersByKeyword = async (
    driver,
    {
        keyword,
        exact_search = false,
        category_group_id = null,
        tender_category_id = null,
        search_mode = GEM_SEARCH_MODES.ADVANCE_SEARCH,
    },
) => {
    const searchKeyword = String(keyword || "").trim();
    const resolvedCategoryGroupId =
        category_group_id != null && Number(category_group_id) >= 1
            ? Number(category_group_id)
            : null;
    const resolvedTenderCategoryId =
        tender_category_id != null && Number(tender_category_id) >= 1
            ? Number(tender_category_id)
            : null;
    if (!searchKeyword) {
        logger.info("No keyword configured, skipping search.");
        return 0;
    }

    if (GEM_RA_NUMBER.test(searchKeyword)) {
        logger.info(`Skipping RA number keyword (not scanning/downloading): ${searchKeyword}`);
        return 0;
    }

    await ensureTenderStorage();

    const knownTenderIds = new Set(await getAllGemTenderIds());
    logger.info(`Scan skip cache loaded: ${knownTenderIds.size} existing tender id(s)`);

    let page;

    if (GEM_BID_NUMBER.test(searchKeyword)) {
        page = new GemPage(driver, GEM_URL);
        await page.open();
        logger.info(`Advance-search by Bid number: ${searchKeyword}`);
        await page.setBidNumber(searchKeyword);
    } else if (search_mode === GEM_SEARCH_MODES.ALL_BIDS) {
        page = new GemAllBidsPage(driver, GEM_URL);
        await page.open();
        await page.selectSearchType(!!exact_search);
        await page.setKeyword(searchKeyword);
        logger.info(
            `All-bids keyword search: ${searchKeyword} (${exact_search ? "Exact Search" : "Contains"})`,
        );
    } else {
        page = new GemPage(driver, GEM_URL);
        await page.open();
        await page.clearBidNumber();
        const categoryMatch = await page.selectCategoryByKeyword(
            searchKeyword,
            !!exact_search,
        );
        if (!categoryMatch?.ok) {
            logger.info(
                `No GeM category match for keyword: ${searchKeyword}` +
                    (exact_search ? " (exact)" : ""),
            );
            return 0;
        }

        logger.info(
            `Advance-search category selected for keyword "${searchKeyword}": ${categoryMatch.text}`,
        );
    }

    await page.clickSearch();
    await page.waitForSearchSettled();
    await page.bidCardContainer();

    if (await page.isNoDataFoundVisible()) {
        logger.info(`No tenders found for keyword: ${searchKeyword}`);
        return 0;
    }

    if (!(await page.isPaginationVisible())) {
        logger.info(`No tenders found for keyword: ${searchKeyword}`);
        return 0;
    }

    const lastPage = await page.getLastPageNumber();
    let changedCount = 0;

    for (let pageNumber = 1; pageNumber <= lastPage; pageNumber++) {
        logger.info(`Downloading page ${pageNumber} of ${lastPage} for ${searchKeyword}...`);

        const cards = await page.bidCards();

        for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
            const card = (await page.bidCards())[cardIndex];
            if (!card) {
                continue;
            }

            let cardText = "";
            try {
                cardText = await card.getText();
            } catch (error) {
                logger.error(`Failed to read bid card text: ${error}`);
                continue;
            }

            if (isReverseAuctionCard(cardText)) {
                const bidHint =
                    cardText.match(/Bid\s*No\.?\s*:\s*(GEM\/\d{4}\/B\/\d+)/i)?.[1] ||
                    cardText.match(/(GEM\/\d{4}\/B\/\d+)/i)?.[0] ||
                    null;
                const raHint =
                    cardText.match(/RA\s*NO\s*:\s*(GEM\/\d{4}\/R\/\d+)/i)?.[1] ||
                    cardText.match(/(GEM\/\d{4}\/R\/\d+)/i)?.[0] ||
                    "unknown";
                logger.info(
                    `Skipping RA card (not scanning/downloading) | keyword=${searchKeyword} page=${pageNumber} card=${cardIndex + 1} bid=${bidHint || "n/a"} ra=${raHint}`,
                );
                continue;
            }

            const tenders = await page.cardBidDownloadLinks(card);
            for (let index = 0; index < tenders.length; index++) {
                // Re-resolve links each pass; DOM can go stale after downloads.
                const freshLinks = await page.cardBidDownloadLinks(
                    (await page.bidCards())[cardIndex],
                );
                const tender = freshLinks[index];
                if (!tender) {
                    continue;
                }

                const tenderId = (await tender.getText()).trim();
                if (!tenderId) {
                    continue;
                }

                if (knownTenderIds.has(tenderId)) {
                    logger.info(`Skipping already-inserted tender: ${tenderId}`);
                    continue;
                }

                try {
                    const { tenderFile, document, buffer } = await downloadTender(
                        driver,
                        tender,
                    );
                    const cookies = await driver.manage().getCookies();
                    const cookieHeader = cookies
                        .map((cookie) => `${cookie.name}=${cookie.value}`)
                        .join("; ");
                    const changed = await processTender({
                        tenderFile,
                        category_group_id: resolvedCategoryGroupId,
                        tender_category_id: resolvedTenderCategoryId,
                        tender_id: tenderId,
                        document,
                        buffer,
                        cookieHeader,
                        existingTender: null,
                    });
                    if (changed) {
                        knownTenderIds.add(tenderId);
                        changedCount += 1;
                    }
                } catch (error) {
                    logger.error(`Failed download ${tenderId}: ${error}`);
                }

                await sleep(driver, DELAY_SHORT);
            }
        }

        if (pageNumber < lastPage) {
            await goToNextPage(driver, page);
        }
    }

    return changedCount;
};
