import {
    assignNextHbtSequence,
    getCustomerInvoiceById,
} from "../db/customer_invoices.js";
import {
    createInvoicePayment,
    deleteInvoicePaymentById,
    getInvoicePaymentById,
    getInvoicePaymentsTotalByCustomerInvoiceId,
    updateInvoicePaymentById,
} from "../db/invoice_payments.js";
import {
    getHbtLegacyMaxInvoiceId,
    isLegacyInvoice,
} from "../libs/invoicer.js";

function rejectIfInvoiceFullyPaid({ invoice, set }) {
    if (invoice?.hbt_sequence != null) {
        set.status = 400;
        return { error: "Invoice is fully paid" };
    }
    return null;
}

async function maybeAssignHbtSequence({ invoiceId }) {
    const invoice = await getCustomerInvoiceById({ id: invoiceId });
    if (!invoice || invoice.hbt_sequence != null) {
        return;
    }

    if (isLegacyInvoice({ id: invoice.id })) {
        return;
    }

    const amountPaid = await getInvoicePaymentsTotalByCustomerInvoiceId({
        customer_invoice_id: invoiceId,
    });
    const grandTotal = Number(invoice.total || 0) + Number(invoice.gst || 0);

    if (grandTotal > 0 && amountPaid >= grandTotal) {
        await assignNextHbtSequence({
            id: invoiceId,
            legacyMaxId: getHbtLegacyMaxInvoiceId(),
        });
    }
}

export async function addInvoicePayment({ body, set }) {
    const invoice = await getCustomerInvoiceById({ id: body.customer_invoice_id });
    if (!invoice) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const rejected = rejectIfInvoiceFullyPaid({ invoice, set });
    if (rejected) {
        return rejected;
    }

    const id = await createInvoicePayment({
        customer_invoice_id: invoice.id,
        amount: body.amount,
        note: body.note?.trim() || null,
        created_on: body.created_on,
    });

    await maybeAssignHbtSequence({ invoiceId: invoice.id });

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

    const invoice = await getCustomerInvoiceById({
        id: existingPayment.customer_invoice_id,
    });
    if (!invoice) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const rejected = rejectIfInvoiceFullyPaid({ invoice, set });
    if (rejected) {
        return rejected;
    }

    await updateInvoicePaymentById({
        id: existingPayment.id,
        amount: body.amount,
        note: body.note?.trim() || null,
        created_on: body.created_on || existingPayment.created_on,
    });

    await maybeAssignHbtSequence({ invoiceId: invoice.id });

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

    const invoice = await getCustomerInvoiceById({
        id: existingPayment.customer_invoice_id,
    });
    if (!invoice) {
        set.status = 404;
        return { error: "Invoice not found" };
    }

    const rejected = rejectIfInvoiceFullyPaid({ invoice, set });
    if (rejected) {
        return rejected;
    }

    await deleteInvoicePaymentById({ id: existingPayment.id });
    set.status = 204;
}
