import { getCustomerById } from "../db/customers.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import {
    createCustomerInvoice,
    deleteCustomerInvoiceById,
    getCustomerInvoiceById,
    updateCustomerInvoiceById,
    updateCustomerInvoiceTotalById,
} from "../db/customer_invoices.js";
import {
    createInvoiceItem,
    getInvoiceItemsByCustomerInvoiceId,
    getInvoiceItemsTotalByCustomerInvoiceId,
} from "../db/invoice_items.js";

async function resolveCustomerAndProject({ customer_id, project_id, set }) {
    const customer = await getCustomerById({ id: Number(customer_id) });
    if (!customer) {
        set.status = 400;
        return { error: "Customer not found" };
    }

    const project = await getCustomerProjectById({ id: Number(project_id) });
    if (!project) {
        set.status = 400;
        return { error: "Customer project not found" };
    }

    if (Number(project.customer_id) !== Number(customer.id)) {
        set.status = 400;
        return { error: "Project does not belong to this customer" };
    }

    return { customer, project };
}

export async function addCustomerInvoice({ body, set }) {
    const resolved = await resolveCustomerAndProject({
        customer_id: body.customer_id,
        project_id: body.project_id,
        set,
    });
    if (resolved.error) {
        return { error: resolved.error };
    }

    const id = await createCustomerInvoice({
        customer_id: resolved.customer.id,
        project_id: resolved.project.id,
        due_date: body.due_date,
        total: 0,
        gst: 0,
    });

    for (const row of body.items) {
        await createInvoiceItem({
            customer_invoice_id: id,
            item: String(row.item).trim(),
            cost: Number(row.cost),
            quantity: Number(row.quantity),
        });
    }

    const total = await getInvoiceItemsTotalByCustomerInvoiceId({ customer_invoice_id: id });
    const gst = Math.round(total * 0.18 * 100) / 100;
    await updateCustomerInvoiceTotalById({ id, total, gst });

    const invoice = await getCustomerInvoiceById({ id });
    const invoiceItems = await getInvoiceItemsByCustomerInvoiceId({ customer_invoice_id: id });

    set.status = 201;
    return { message: "Customer invoice created", invoice, items: invoiceItems };
}

export async function updateCustomerInvoice({ body, set }) {
    const existing = await getCustomerInvoiceById({ id: body.id });
    if (!existing) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const resolved = await resolveCustomerAndProject({
        customer_id: body.customer_id,
        project_id: body.project_id,
        set,
    });
    if (resolved.error) {
        return { error: resolved.error };
    }

    await updateCustomerInvoiceById({
        id: body.id,
        customer_id: resolved.customer.id,
        project_id: resolved.project.id,
        due_date: body.due_date,
        total: Number(body.total ?? existing.total ?? 0),
        gst: Number(body.gst ?? existing.gst ?? 0),
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
