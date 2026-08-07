import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createInvoiceItem({ customer_invoice_id, item, cost, quantity }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO INVOICE_ITEMS ${sql(
                { customer_invoice_id, item, cost, quantity },
                "customer_invoice_id",
                "item",
                "cost",
                "quantity",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createInvoiceItem: ${error}`);
            throw error;
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
