import { getCustomerInvoiceById } from "../db/customer_invoices.js";
import { updateCustomerInvoiceTotal } from "./customer_invoices.js";
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
    });

    await updateCustomerInvoiceTotal({ id: invoice.id });

    const item = await getInvoiceItemById({ id: itemId });
    const updatedInvoice = await getCustomerInvoiceById({ id: invoice.id });

    set.status = 201;
    return { message: "Invoice item created", item, invoice: updatedInvoice };
}

export async function updateInvoiceItem({ params, body, set }) {
    const existingItem = await getInvoiceItemById({ id: params.id });
    if (!existingItem) {
        set.status = 404;
        return { error: "Invoice item not found" };
    }

    await updateInvoiceItemById({
        ...existingItem,
        ...body,
        item: body.item.trim(),
    });

    await updateCustomerInvoiceTotal({ id: existingItem.customer_invoice_id });

    const item = await getInvoiceItemById({ id: existingItem.id });
    const updatedInvoice = await getCustomerInvoiceById({ id: existingItem.customer_invoice_id });

    set.status = 200;
    return { message: "Invoice item updated", item, invoice: updatedInvoice };
}

export async function deleteInvoiceItem({ params, set }) {
    const existingItem = await getInvoiceItemById({ id: params.id });
    if (!existingItem) {
        set.status = 404;
        return { error: "Invoice item not found" };
    }

    await deleteInvoiceItemById({ id: existingItem.id });
    await updateCustomerInvoiceTotal({ id: existingItem.customer_invoice_id });

    const updatedInvoice = await getCustomerInvoiceById({ id: existingItem.customer_invoice_id });

    set.status = 200;
    return { message: "Invoice item deleted", invoice: updatedInvoice };
}
