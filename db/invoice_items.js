import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createInvoiceItem({ customer_invoice_id, item, cost, quantity }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO INVOICE_ITEMS (customer_invoice_id, item, cost, quantity)
            VALUES (
                ${customer_invoice_id},
                ${item},
                ${cost},
                ${quantity}
            )
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createInvoiceItem: ${error}`);
        });
}

export async function updateInvoiceItemById({ id, item, cost, quantity }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE INVOICE_ITEMS
            SET
                item = ${item},
                cost = ${cost},
                quantity = ${quantity}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateInvoiceItemById: ${error}`);
    });
}

export async function deleteInvoiceItemById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM INVOICE_ITEMS WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteInvoiceItemById: ${error}`);
        },
    );
}

export async function getInvoiceItemById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM INVOICE_ITEMS
            WHERE id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getInvoiceItemById: ${error}`);
            return null;
        });
}

export async function getInvoiceItemsByCustomerInvoiceId({ customer_invoice_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM INVOICE_ITEMS
            WHERE customer_invoice_id = ${customer_invoice_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getInvoiceItemsByCustomerInvoiceId: ${error}`);
            return [];
        });
}

export async function getInvoiceItemsTotalByCustomerInvoiceId({ customer_invoice_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM INVOICE_ITEMS
            WHERE customer_invoice_id = ${customer_invoice_id}
        `,
    )
        .then((result) => Number(result?.[0]?.total ?? 0))
        .catch((error) => {
            logger.error(`getInvoiceItemsTotalByCustomerInvoiceId: ${error}`);
            return 0;
        });
}
