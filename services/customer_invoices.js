import { CONSTANTS } from "@hammerbyte/utils";
import { getCustomerById } from "../db/customers.js";
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
import { getProjectApplicationsByProjectId } from "../db/project_applications.js";
import { getAllApplicationServicesByApplicationId } from "../db/application_services.js";
import {
    getMailsByApplicationServiceIdForInvoice,
    updateMailsInvoicedByApplicationServiceIdForInvoice,
} from "../db/mails.js";
import { getServiceById } from "../db/services.js";

const { SERVICES } = CONSTANTS.SAAS;

export async function updateCustomerInvoiceTotal({ id }) {
    const total = await getInvoiceItemsTotalByCustomerInvoiceId({ customer_invoice_id: id });
    const gst = Math.round(total * 0.18 * 100) / 100;
    await updateCustomerInvoiceTotalById({ id, total, gst });
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

    const [year, month] = body.date.split("-").map(Number);
    const due_date = `${body.date}-${`${new Date(Date.UTC(year, month, 0)).getUTCDate()}`.padStart(2, "0")}`;

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

    const [year, month] = body.due_date.split("-").map(Number);
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

    const invoiceDueDate = existingInvoice.due_date;
    const start_date = `${invoiceDueDate.slice(0, 7)}-01`;
    const end_date = invoiceDueDate;

    const applications = await getProjectApplicationsByProjectId({
        project_id: existingInvoice.project_id,
    });

    let added = 0;

    for (const application of applications) {
        const applicationServices = await getAllApplicationServicesByApplicationId({
            application_id: application.id,
        });

        for (const applicationService of applicationServices) {
            if (applicationService.title === SERVICES.MAILER) {
                const count = await getMailsByApplicationServiceIdForInvoice({
                    application_service_id: applicationService.id,
                    start_date,
                    end_date,
                });

                if (count <= 0) {
                    continue;
                }

                const service = await getServiceById({ id: applicationService.service_id });
                if (!service) {
                    continue;
                }

                await createInvoiceItem({
                    customer_invoice_id: existingInvoice.id,
                    item: service.title,
                    cost: service.cost,
                    quantity: count,
                });

                await updateMailsInvoicedByApplicationServiceIdForInvoice({
                    application_service_id: applicationService.id,
                    start_date,
                    end_date,
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
            : "No uninvoiced service usage found",
        invoice: updatedInvoice,
        items,
    };
}
