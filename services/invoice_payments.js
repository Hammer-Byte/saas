import { getCustomerInvoiceById } from "../db/customer_invoices.js";
import {
    createInvoicePayment,
    deleteInvoicePaymentById,
    getInvoicePaymentById,
    updateInvoicePaymentById,
} from "../db/invoice_payments.js";

export async function addInvoicePayment({ body, set }) {
    const invoice = await getCustomerInvoiceById({ id: body.customer_invoice_id });
    if (!invoice) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const id = await createInvoicePayment({
        ...body,
        customer_invoice_id: invoice.id,
        note: body.note?.trim() || null,
    });

    const payment = await getInvoicePaymentById({ id });

    set.status = 201;
    return { message: "Invoice payment created", payment };
}

export async function updateInvoicePayment({ params, body, set }) {
    const existingPayment = await getInvoicePaymentById({ id: params.id });
    if (!existingPayment) {
        set.status = 404;
        return { error: "Invoice payment not found" };
    }

    await updateInvoicePaymentById({
        ...body,
        id: existingPayment.id,
        note: body.note?.trim() || null,
    });

    const payment = await getInvoicePaymentById({ id: existingPayment.id });

    set.status = 200;
    return { message: "Invoice payment updated", payment };
}

export async function deleteInvoicePayment({ params, set }) {
    const existingPayment = await getInvoicePaymentById({ id: params.id });
    if (!existingPayment) {
        set.status = 404;
        return { error: "Invoice payment not found" };
    }

    await deleteInvoicePaymentById({ id: existingPayment.id });
    set.status = 204;
}
