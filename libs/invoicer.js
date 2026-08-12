import { join } from "node:path";
import { formatCurrency } from "./utils.js";

const invoiceAssetsDirectory = `${join(process.cwd(), "templates", "invoice")}/`;

export function formatInvoiceNumber({ id }) {
    return `HBT-${`${id}`.padStart(7, "0")}`;
}

export function escapeInvoiceHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

export function buildInvoiceBillStatusHtml(status) {
    const paidStruck = status === "paid" ? "" : " struck";
    const partialStruck = status === "partial" ? "" : " struck";
    const dueStruck = status === "due" ? "" : " struck";

    return `<span class="paid${paidStruck}">Paid</span><span class="sep">/</span><span class="partial${partialStruck}">partial</span><span class="sep">/</span><span class="due${dueStruck}">Due</span>`;
}

export function buildInvoiceItemsHtml(items) {
    return items
        .map(
            (row, index) => `<tr>
                <td>${index + 1}</td>
                <td class="description">${escapeInvoiceHtml(row.item)}</td>
                <td>${formatCurrency(row.quantity)}</td>
                <td><strong>${formatCurrency(row.cost)}</strong></td>
                <td><strong>${formatCurrency(row.amount)}</strong></td>
            </tr>`,
        )
        .join("\n");
}

export function resolveInvoiceTemplateAssets(html) {
    return html
        .replace(/src="invoice\//g, `src="${invoiceAssetsDirectory}`)
        .replace(/url\("invoice\//g, `url("${invoiceAssetsDirectory}`);
}
