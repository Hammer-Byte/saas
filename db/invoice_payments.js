import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createInvoicePayment({ customer_invoice_id, amount, note = null }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO INVOICE_PAYMENTS ${sql(
                { customer_invoice_id, amount, note },
                "customer_invoice_id",
                "amount",
                "note",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createInvoicePayment: ${error}`);
        });
}

export async function updateInvoicePaymentById({ id, amount, note = null }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE INVOICE_PAYMENTS
            SET
                amount = ${amount},
                note = ${note}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateInvoicePaymentById: ${error}`);
    });
}

export async function deleteInvoicePaymentById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM INVOICE_PAYMENTS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteInvoicePaymentById: ${error}`);
        },
    );
}

export async function getInvoicePaymentById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM INVOICE_PAYMENTS
            WHERE id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getInvoicePaymentById: ${error}`);
            return null;
        });
}

export async function getInvoicePaymentsByCustomerInvoiceId({ customer_invoice_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM INVOICE_PAYMENTS
            WHERE customer_invoice_id = ${customer_invoice_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getInvoicePaymentsByCustomerInvoiceId: ${error}`);
            return [];
        });
}

export async function getInvoicePaymentsTotalByCustomerInvoiceId({ customer_invoice_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COALESCE(SUM(amount + gst), 0) AS total
            FROM INVOICE_PAYMENTS
            WHERE customer_invoice_id = ${customer_invoice_id}
        `,
    )
        .then((result) => Number(result?.[0]?.total ?? 0))
        .catch((error) => {
            logger.error(`getInvoicePaymentsTotalByCustomerInvoiceId: ${error}`);
            return 0;
        });
}

export async function getInvoicePaymentsByCreatedOnRange({ start, end }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM INVOICE_PAYMENTS
            WHERE DATE(created_on) >= ${start} AND DATE(created_on) <= ${end}
            ORDER BY created_on DESC, id DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getInvoicePaymentsByCreatedOnRange: ${error}`);
            return [];
        });
}
