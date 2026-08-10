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
    deleteInvoiceItemById,
    getInvoiceItemById,
    getInvoiceItemsByCustomerInvoiceId,
    getInvoiceItemsTotalByCustomerInvoiceId,
    updateInvoiceItemById,
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

async function recalcCustomerInvoiceTotal({ id }) {
    const total = await getInvoiceItemsTotalByCustomerInvoiceId({ customer_invoice_id: id });
    const gst = Math.round(total * 0.18 * 100) / 100;
    await updateCustomerInvoiceTotalById({ id, total, gst });
}

export async function addCustomerInvoice({ body, set }) {
    const resolved = await resolveCustomerAndProject({ ...body, set });
    if (resolved.error) {
        return { error: resolved.error };
    }

    const id = await createCustomerInvoice({
        customer_id: resolved.customer.id,
        project_id: resolved.project.id,
    });

    for (const row of body.items) {
        await createInvoiceItem({
            ...row,
            customer_invoice_id: id,
            item: String(row.item).trim(),
            cost: Number(row.cost),
            quantity: Number(row.quantity),
        });
    }

    await recalcCustomerInvoiceTotal({ id });

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

export async function addInvoiceItem({ body, set }) {
    const invoice = await getCustomerInvoiceById({ id: Number(body.customer_invoice_id) });
    if (!invoice) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const itemId = await createInvoiceItem({
        ...body,
        customer_invoice_id: invoice.id,
        item: String(body.item).trim(),
        cost: Number(body.cost),
        quantity: Number(body.quantity),
    });

    await recalcCustomerInvoiceTotal({ id: invoice.id });

    const item = await getInvoiceItemById({ id: itemId });
    const updatedInvoice = await getCustomerInvoiceById({ id: invoice.id });

    set.status = 201;
    return { message: "Invoice item created", item, invoice: updatedInvoice };
}

export async function updateInvoiceItem({ params, body, set }) {
    const existing = await getInvoiceItemById({ id: Number(params.id) });
    if (!existing) {
        set.status = 404;
        return { error: "Invoice item not found" };
    }

    await updateInvoiceItemById({
        ...existing,
        ...body,
        item: String(body.item).trim(),
        cost: Number(body.cost),
        quantity: Number(body.quantity),
    });

    await recalcCustomerInvoiceTotal({ id: existing.customer_invoice_id });

    const item = await getInvoiceItemById({ id: existing.id });
    const updatedInvoice = await getCustomerInvoiceById({ id: existing.customer_invoice_id });

    set.status = 200;
    return { message: "Invoice item updated", item, invoice: updatedInvoice };
}

export async function deleteInvoiceItem({ params, set }) {
    const existing = await getInvoiceItemById({ id: Number(params.id) });
    if (!existing) {
        set.status = 404;
        return { error: "Invoice item not found" };
    }

    await deleteInvoiceItemById({ id: existing.id });
    await recalcCustomerInvoiceTotal({ id: existing.customer_invoice_id });

    const updatedInvoice = await getCustomerInvoiceById({ id: existing.customer_invoice_id });

    set.status = 200;
    return { message: "Invoice item deleted", invoice: updatedInvoice };
}
