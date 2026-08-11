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

export async function calculateCustomerInvoiceTotal({ id }) {
    const total = await getInvoiceItemsTotalByCustomerInvoiceId({ customer_invoice_id: id });
    const gst = Math.round(total * 0.18 * 100) / 100;
    await updateCustomerInvoiceTotalById({ id, total, gst });
}

export async function addCustomerInvoice({ body, set }) {
    const customer = await getCustomerById({ id: Number(body.customer_id) });
    if (!customer) {
        set.status = 400;
        return { error: "Customer not found" };
    }

    const project = await getCustomerProjectById({ id: Number(body.project_id) });
    if (!project) {
        set.status = 400;
        return { error: "Customer project not found" };
    }

    if (Number(project.customer_id) !== Number(customer.id)) {
        set.status = 400;
        return { error: "Project does not belong to this customer" };
    }

    const [year, month] = body.date.split("-").map(Number);
    const due_date = `${body.date}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;

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
            item: String(row.item).trim(),
            cost: Number(row.cost),
            quantity: Number(row.quantity),
        });
    }

    await calculateCustomerInvoiceTotal({ id });

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
    const existing = await getCustomerInvoiceById({ id: body.id });
    if (!existing) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const [year, month] = body.due_date.split("-").map(Number);
    const monthInvoice = await getCustomerInvoiceByCustomerProjectAndMonth({
        customer_id: existing.customer_id,
        project_id: existing.project_id,
        year,
        month,
    });
    if (monthInvoice && Number(monthInvoice.id) !== Number(existing.id)) {
        set.status = 409;
        return { error: "An invoice already exists for this project in that month" };
    }

    await updateCustomerInvoiceById({
        ...existing,
        ...body,
        total: Number(existing.total ?? 0),
        gst: Number(existing.gst ?? 0),
    });

    const invoice = await getCustomerInvoiceById({ id: body.id });

    set.status = 200;
    return { message: "Customer invoice updated", invoice };
}

export async function deleteCustomerInvoice({ params, set }) {
    const existing = await getCustomerInvoiceById({ id: Number(params.id) });
    if (!existing) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    await deleteCustomerInvoiceById({ id: existing.id });
    set.status = 204;
}
