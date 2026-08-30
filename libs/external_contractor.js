import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import wkhtmltopdf from "wkhtmltopdf";

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

export function escapeExternalContractHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

export function formatExternalContractCreatedOn(date) {
    if (date == null || date === "") {
        return "";
    }

    const parsed = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(parsed.getTime())) {
        return "";
    }

    return `${parsed.getDate()} ${MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

export function buildExternalContractContractorMediaHtml({
    selfie_src = null,
    signature_src = null,
} = {}) {
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

export function resolveExternalContractTemplateAssets(html) {
    return html
        .replace(/src="assets\//g, `src="${sharedAssetsDirectory}`)
        .replace(/url\("assets\//g, `url("${sharedAssetsDirectory}`);
}

export function buildExternalContractClausesHtml(clauses) {
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
                                  `<li>${escapeExternalContractHtml(subclause.body)}</li>`,
                          )
                          .join("\n")}</ol>`
                    : "";

            return `<li>
                <div class="clause-title">${escapeExternalContractHtml(clause.title)}</div>
                ${subclausesHtml}
            </li>`;
        })
        .join("\n")}</ol>`;
}

export async function generateExternalContractPdf(html) {
    const stamp = Date.now();
    const output = join(tmpdir(), `external-contract-${stamp}.pdf`);
    const headerHtmlPath = join(tmpdir(), `external-contract-header-${stamp}.html`);
    const footerHtmlPath = join(tmpdir(), `external-contract-footer-${stamp}.html`);

    writeFileSync(
        headerHtmlPath,
        `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
    html, body { margin: 0; padding: 0; }
    img { width: 210mm; display: block; }
</style>
</head>
<body>
    <img src="${sharedAssetsDirectory}header.png" alt="HammerByte">
</body>
</html>`,
    );

    writeFileSync(
        footerHtmlPath,
        `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
    html, body { margin: 0; padding: 0; }
    img { width: 210mm; display: block; }
</style>
</head>
<body>
    <img src="${sharedAssetsDirectory}footer.png" alt="">
</body>
</html>`,
    );

    try {
        await writePdf(html, {
            output,
            pageSize: "A4",
            enableLocalFileAccess: true,
            headerHtml: headerHtmlPath,
            footerHtml: footerHtmlPath,
            marginTop: "54mm",
            marginRight: "0mm",
            marginBottom: "12mm",
            marginLeft: "0mm",
            headerSpacing: 0,
            footerSpacing: 0,
        });

        return readFileSync(output);
    } finally {
        for (const path of [output, headerHtmlPath, footerHtmlPath]) {
            try {
                unlinkSync(path);
            } catch {
                // ignore cleanup errors
            }
        }
    }
}
