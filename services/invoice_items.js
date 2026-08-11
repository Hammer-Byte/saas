import { getCustomerInvoiceById } from "../db/customer_invoices.js";
import { calculateCustomerInvoiceTotal } from "./customer_invoices.js";
import {
    createInvoiceItem,
    deleteInvoiceItemById,
    getInvoiceItemById,
    updateInvoiceItemById,
} from "../db/invoice_items.js";

export async function addInvoiceItem({ body, set }) {
    const invoice = await getCustomerInvoiceById({ id: body.customer_invoice_id });
    if (!invoice) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const itemId = await createInvoiceItem({
        ...body,
        customer_invoice_id: invoice.id,
        item: body.item.trim(),
        cost: body.cost,
        quantity: body.quantity,
    });

    await calculateCustomerInvoiceTotal({ id: invoice.id });

    const item = await getInvoiceItemById({ id: itemId });
    const updatedInvoice = await getCustomerInvoiceById({ id: invoice.id });

    set.status = 201;
    return { message: "Invoice item created", item, invoice: updatedInvoice };
}

export async function updateInvoiceItem({ params, body, set }) {
    const existing = await getInvoiceItemById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Invoice item not found" };
    }

    await updateInvoiceItemById({
        ...existing,
        ...body,
        item: body.item.trim(),
        cost: body.cost,
        quantity: body.quantity,
    });

    await calculateCustomerInvoiceTotal({ id: existing.customer_invoice_id });

    const item = await getInvoiceItemById({ id: existing.id });
    const updatedInvoice = await getCustomerInvoiceById({ id: existing.customer_invoice_id });

    set.status = 200;
    return { message: "Invoice item updated", item, invoice: updatedInvoice };
}

export async function deleteInvoiceItem({ params, set }) {
    const existing = await getInvoiceItemById({ id: params.id });
    if (!existing) {
        set.status = 404;
        return { error: "Invoice item not found" };
    }

    await deleteInvoiceItemById({ id: existing.id });
    await calculateCustomerInvoiceTotal({ id: existing.customer_invoice_id });

    const updatedInvoice = await getCustomerInvoiceById({ id: existing.customer_invoice_id });

    set.status = 200;
    return { message: "Invoice item deleted", invoice: updatedInvoice };
}
