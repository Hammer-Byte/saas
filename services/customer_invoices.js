import { getCustomerById } from "../db/customers.js";
import {
    createCustomerInvoice,
    deleteCustomerInvoiceById,
    getCustomerInvoiceById,
    updateCustomerInvoiceById,
} from "../db/customer_invoices.js";

export async function addCustomerInvoice({ body, set }) {
    const customer = await getCustomerById({ id: Number(body.customer_id) });
    if (!customer) {
        set.status = 400;
        return { error: "Customer not found" };
    }

    const id = await createCustomerInvoice({
        customer_id: customer.id,
        due_date: body.due_date,
        total: Number(body.total ?? 0),
        gst: Number(body.gst ?? 0),
    });

    const invoice = await getCustomerInvoiceById({ id });

    set.status = 201;
    return { message: "Customer invoice created", invoice };
}

export async function updateCustomerInvoice({ body, set }) {
    const existing = await getCustomerInvoiceById({ id: body.id });
    if (!existing) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const customer = await getCustomerById({ id: Number(body.customer_id) });
    if (!customer) {
        set.status = 400;
        return { error: "Customer not found" };
    }

    await updateCustomerInvoiceById({
        id: body.id,
        customer_id: customer.id,
        due_date: body.due_date,
        total: Number(body.total ?? 0),
        gst: Number(body.gst ?? 0),
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
