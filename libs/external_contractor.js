import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync, unlinkSync } from "node:fs";
import { promisify } from "node:util";
import wkhtmltopdf from "wkhtmltopdf";

const writePdf = promisify(wkhtmltopdf);

const sharedAssetsDirectory = `file://${join(process.cwd(), "templates", "assets")}/`;

export function escapeExternalContractHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
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
    const output = join(tmpdir(), `external-contract-${Date.now()}.pdf`);

    await writePdf(html, {
        output,
        pageSize: "A4",
        enableLocalFileAccess: true,
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
    });

    try {
        return readFileSync(output);
    } finally {
        unlinkSync(output);
    }
}
