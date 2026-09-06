import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import wkhtmltopdf from "wkhtmltopdf";
import { getReadableDate } from "./date.js";

const writePdf = promisify(wkhtmltopdf);

const sharedAssetsDirectory = `file://${join(process.cwd(), "templates", "assets")}/`;

const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

export function escapeContractHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

export function formatContractCreatedOn(date) {
    const wallClock = getReadableDate("YYYY-MM-DD", date);
    if (!wallClock) {
        return "";
    }

    const [year, month, day] = wallClock.split("-");
    return `${Number(day)} ${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

export function buildContractContractorMediaHtml({ selfie_src = null, signature_src = null } = {}) {
    if (selfie_src && signature_src) {
        return `<div class="contractor-media">
            <img src="${selfie_src}" alt="Contractor selfie">
            <img src="${signature_src}" alt="Contractor signature">
        </div>`;
    }

    return `<div class="contractor-media">
        <div class="media-placeholder">Selfie<br>(will appear here)</div>
        <div class="media-placeholder">Signature<br>(will appear here)</div>
    </div>`;
}

export function resolveContractTemplateAssets(html) {
    return html
        .replace(/src="assets\//g, `src="${sharedAssetsDirectory}`)
        .replace(/url\("assets\//g, `url("${sharedAssetsDirectory}`);
}

export function buildContractClausesHtml(clauses) {
    if (!clauses?.length) {
        return `<div class="empty-clauses">No clauses on this contract.</div>`;
    }

    return `<ol class="clauses">${clauses
        .map((clause) => {
            const subclausesHtml =
                clause.subclauses?.length > 0
                    ? `<ol type="a" class="subclauses">${clause.subclauses
                          .map(
                              (subclause) =>
                                  `<li>${escapeContractHtml(subclause.body)}</li>`,
                          )
                          .join("\n")}</ol>`
                    : "";

            return `<li>
                <div class="clause-title">${escapeContractHtml(clause.title)}</div>
                ${subclausesHtml}
            </li>`;
        })
        .join("\n")}</ol>`;
}

export async function generateContractPdf(html) {
    const output = join(tmpdir(), `contract-${Date.now()}.pdf`);
    const htmlPath = join(tmpdir(), `contract-${Date.now()}.html`);

    writeFileSync(htmlPath, html);

    try {
        await writePdf(`file://${htmlPath}`, {
            output,
            pageSize: "A4",
            enableLocalFileAccess: true,
            disableSmartShrinking: true,
            marginTop: "14mm",
            marginRight: "0",
            marginBottom: "14mm",
            marginLeft: "0",
        });

        return readFileSync(output);
    } finally {
        for (const path of [output, htmlPath]) {
            try {
                unlinkSync(path);
            } catch {
                // ignore cleanup errors
            }
        }
    }
}
