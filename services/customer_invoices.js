import { CONSTANTS, filer } from "@hammerbyte/utils";
import { getReadableDate, getWritableDate } from "../libs/date.js";
import transporter from "../libs/transporter.js";
import {
    buildInvoiceBillStatusHtml,
    buildInvoiceCustomerDetailsHtml,
    buildInvoiceItemsHtml,
    formatInvoiceNumber,
    generateInvoicePdf,
    resolveInvoiceTemplateAssets,
} from "../libs/invoicer.js";
import { formatCurrency } from "../libs/utils.js";
import { getCustomerById } from "../db/customers.js";
import { getCustomerEmailsByCustomerId } from "../db/customer_emails.js";
import { getCustomerPhonesByCustomerId } from "../db/customer_phones.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import {
    createCustomerInvoice,
    deleteCustomerInvoiceById,
    getCustomerInvoiceByCustomerProjectAndMonth,
    getCustomerInvoiceById,
    updateCustomerInvoiceById,
    updateCustomerInvoiceTotalById,
} from "../db/customer_invoices.js";
import {
    createInvoiceItem,
    getInvoiceItemsByCustomerInvoiceId,
    getInvoiceItemsTotalByCustomerInvoiceId,
} from "../db/invoice_items.js";
import { getInvoicePaymentsTotalByCustomerInvoiceId } from "../db/invoice_payments.js";
import { getProjectApplicationsByProjectId } from "../db/project_applications.js";
import { getAllApplicationServicesByApplicationId } from "../db/application_services.js";
import {
    getMailsByApplicationServiceIdForInvoice,
} from "../db/mails.js";
import { getTotalFileSizeByApplicationServiceId } from "../db/files.js";
import { updateFileSizesByApplicationServiceId } from "./bucketizer.js";
import { getServiceById } from "../db/services.js";

const { SERVICES } = CONSTANTS.SAAS;

export async function updateCustomerInvoiceTotal({ id }) {
    const total = await getInvoiceItemsTotalByCustomerInvoiceId({ customer_invoice_id: id });
    const gst = Math.round(total * 0.18 * 100) / 100;
    await updateCustomerInvoiceTotalById({ id, total, gst });
}

export async function getCustomerInvoiceHtml({ id }) {
    const invoice = await getCustomerInvoiceById({ id });
    if (!invoice) {
        return null;
    }

    const customer = await getCustomerById({ id: invoice.customer_id });
    const customerPhones = await getCustomerPhonesByCustomerId({
        customer_id: invoice.customer_id,
    });
    const customerEmails = await getCustomerEmailsByCustomerId({
        customer_id: invoice.customer_id,
    });
    const items = await getInvoiceItemsByCustomerInvoiceId({
        customer_invoice_id: invoice.id,
    });
    const amountPaid = await getInvoicePaymentsTotalByCustomerInvoiceId({
        customer_invoice_id: invoice.id,
    });

    const subTotal = Number(invoice.total || 0);
    const gst = Number(invoice.gst || 0);
    const grandTotal = subTotal + gst;
    const amountDue = Math.max(grandTotal - amountPaid, 0);

    let billStatus = "due";
    if (amountPaid >= grandTotal && grandTotal > 0) {
        billStatus = "paid";
    } else if (amountPaid > 0) {
        billStatus = "partial";
    }

    const html = filer.prepareTemplated("templates/invoice.html", {
        invoice_number: formatInvoiceNumber({ id: invoice.id }),
        customer_details: buildInvoiceCustomerDetailsHtml({
            name: customer?.company || customer?.full_name,
            phone: customerPhones.join(", "),
            email: customerEmails.join(", "),
            pan_gst: customer?.pan_gst,
        }),
        invoice_date: getReadableDate("DD/MM/YYYY", invoice.created_on),
        due_date: getReadableDate("DD/MM/YYYY", invoice.due_date),
        bill_status: buildInvoiceBillStatusHtml(billStatus),
        items: buildInvoiceItemsHtml(items),
        sub_total: formatCurrency(subTotal),
        gst: formatCurrency(gst),
        total: formatCurrency(grandTotal),
        amount_paid: formatCurrency(amountPaid),
        amount_due: formatCurrency(amountDue),
    });

    return resolveInvoiceTemplateAssets(html);
}

export async function getCustomerInvoicePdf({ params, set }) {
    const html = await getCustomerInvoiceHtml({ id: params.id });
    if (!html) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const pdf = await generateInvoicePdf(html);
    const fileName = `${formatInvoiceNumber({ id: params.id })}.pdf`;

    set.headers["Content-Type"] = "application/pdf";
    set.headers["Content-Disposition"] = `attachment; filename="${fileName}"`;
    return pdf;
}

export async function createCustomerInvoiceReminder({ params, set }) {
    const invoice = await getCustomerInvoiceById({ id: params.id });
    if (!invoice) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const customerEmails = await getCustomerEmailsByCustomerId({ customer_id: invoice.customer_id });
    if (!customerEmails.length) {
        set.status = 400;
        return { error: "No customer emails" };
    }

    const customer = await getCustomerById({ id: invoice.customer_id });
    const amountPaid = await getInvoicePaymentsTotalByCustomerInvoiceId({
        customer_invoice_id: invoice.id,
    });
    const html = await getCustomerInvoiceHtml({ id: invoice.id });

    const pdf = await generateInvoicePdf(html);
    const invoiceNumber = formatInvoiceNumber({ id: invoice.id });
    const grandTotal = Number(invoice.total || 0) + Number(invoice.gst || 0);
    const reminderHtml = filer.prepareTemplated("templates/invoice_reminder.html", {
        invoice_number: invoiceNumber,
        customer_name: customer?.company || customer?.full_name || "--",
        invoice_date: getReadableDate("DD/MM/YYYY", invoice.created_on),
        due_date: getReadableDate("DD/MM/YYYY", invoice.due_date),
        amount_due: formatCurrency(Math.max(grandTotal - amountPaid, 0)),
        app_name: "HammerByte",
    });

    for (const email of customerEmails) {
        transporter.transport({
            recipient: email,
            subject: `Invoice reminder — ${invoiceNumber}`,
            body: reminderHtml,
            html_enabled: true,
            attachments: [
                {
                    filename: `${invoiceNumber}.pdf`,
                    content: pdf,
                    contentType: "application/pdf",
                },
            ],
        });
    }

    set.status = 200;
    return { message: "Reminder sent" };
}

export async function addCustomerInvoice({ body, set }) {
    const customer = await getCustomerById({ id: body.customer_id });
    if (!customer) {
        set.status = 400;
        return { error: "Customer not found" };
    }

    const project = await getCustomerProjectById({ id: body.project_id });
    if (!project) {
        set.status = 400;
        return { error: "Customer project not found" };
    }

    if (project.customer_id !== customer.id) {
        set.status = 400;
        return { error: "Project does not belong to this customer" };
    }

    const year = Number(getReadableDate("YYYY", body.date));
    const month = Number(getReadableDate("MM", body.date));
    const due_date = getWritableDate("YYYY-MM-DD", new Date(year, month, 0));

    const monthInvoice = await getCustomerInvoiceByCustomerProjectAndMonth({
        customer_id: customer.id,
        project_id: project.id,
        year,
        month,
    });

    const id =
        monthInvoice?.id ??
        (await createCustomerInvoice({
            customer_id: customer.id,
            project_id: project.id,
            due_date,
        }));

    for (const row of body.items) {
        await createInvoiceItem({
            ...row,
            customer_invoice_id: id,
            item: row.item.trim(),
        });
    }

    await updateCustomerInvoiceTotal({ id });

    const invoice = await getCustomerInvoiceById({ id });
    const items = await getInvoiceItemsByCustomerInvoiceId({ customer_invoice_id: id });

    set.status = monthInvoice ? 200 : 201;
    return {
        message: monthInvoice ? "Items added to existing invoice" : "Customer invoice created",
        invoice,
        items,
    };
}

export async function updateCustomerInvoice({ body, set }) {
    const existingInvoice = await getCustomerInvoiceById({ id: body.id });
    if (!existingInvoice) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const year = Number(getReadableDate("YYYY", body.due_date));
    const month = Number(getReadableDate("MM", body.due_date));
    const monthInvoice = await getCustomerInvoiceByCustomerProjectAndMonth({
        customer_id: existingInvoice.customer_id,
        project_id: existingInvoice.project_id,
        year,
        month,
    });
    if (monthInvoice && monthInvoice.id !== existingInvoice.id) {
        set.status = 409;
        return { error: "An invoice already exists for this project in that month" };
    }

    await updateCustomerInvoiceById({
        ...existingInvoice,
        ...body,
    });

    const invoice = await getCustomerInvoiceById({ id: body.id });

    set.status = 200;
    return { message: "Customer invoice updated", invoice };
}

export async function deleteCustomerInvoice({ params, set }) {
    const existingInvoice = await getCustomerInvoiceById({ id: params.id });
    if (!existingInvoice) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    await deleteCustomerInvoiceById({ id: existingInvoice.id });
    set.status = 204;
}

export async function addCustomerInvoiceServiceUsage({ params, set }) {
    const existingInvoice = await getCustomerInvoiceById({ id: params.id });
    if (!existingInvoice) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const end_date = getReadableDate("YYYY-MM-DD", existingInvoice.due_date);
    const start_date = getWritableDate(
        "YYYY-MM-DD",
        new Date(
            Number(getReadableDate("YYYY", end_date)),
            Number(getReadableDate("MM", end_date)) - 1,
            1,
        ),
    );
    const month = Number(getReadableDate("MM", end_date));
    const year = Number(getReadableDate("YYYY", end_date));

    const applications = await getProjectApplicationsByProjectId({
        project_id: existingInvoice.project_id,
    });

    let added = 0;

    for (const application of applications) {
        const applicationServices = await getAllApplicationServicesByApplicationId({
            application_id: application.id,
        });

        for (const applicationService of applicationServices) {
            const service = await getServiceById({ id: applicationService.service_id });
            if (!service) {
                continue;
            }

            if (applicationService.title === SERVICES.MAILER) {
                const usageQuantity = await getMailsByApplicationServiceIdForInvoice({
                    application_service_id: applicationService.id,
                    start_date,
                    end_date,
                });

                if (usageQuantity <= 0) {
                    continue;
                }

                const unitPrice = Number(service.cost);
                await createInvoiceItem({
                    customer_invoice_id: existingInvoice.id,
                    item: `Service Usage - ${service.title.toUpperCase()}`,
                    cost: unitPrice,
                    quantity: Number(usageQuantity),
                });

                added += 1;
            } else if (applicationService.title === SERVICES.BUCKETIZER) {
                await updateFileSizesByApplicationServiceId({
                    application_service_id: applicationService.id,
                });

                const usageQuantity = await getTotalFileSizeByApplicationServiceId({
                    application_service_id: applicationService.id,
                    month,
                    year,
                });

                if (usageQuantity <= 0) {
                    continue;
                }

                const unitPrice = Number(service.cost);
                await createInvoiceItem({
                    customer_invoice_id: existingInvoice.id,
                    item: `Service Usage - ${service.title.toUpperCase()}`,
                    cost: unitPrice,
                    quantity: Number(usageQuantity),
                });

                added += 1;
            }
        }
    }

    await updateCustomerInvoiceTotal({ id: existingInvoice.id });

    const updatedInvoice = await getCustomerInvoiceById({ id: existingInvoice.id });
    const items = await getInvoiceItemsByCustomerInvoiceId({
        customer_invoice_id: existingInvoice.id,
    });

    set.status = 200;
    return {
        message: added
            ? `Added ${added} service usage item(s)`
            : "No service usage found for this invoice month",
        invoice: updatedInvoice,
        items,
    };
}
