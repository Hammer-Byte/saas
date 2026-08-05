import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createCustomerInvoice({ customer_id, due_date, total = 0, gst = 0 }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CUSTOMER_INVOICES ${sql(
                { customer_id, due_date, total, gst },
                "customer_id",
                "due_date",
                "total",
                "gst",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createCustomerInvoice: ${error}`);
            throw error;
        });
}

export async function updateCustomerInvoiceById({ id, customer_id, due_date, total, gst }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CUSTOMER_INVOICES
            SET
                customer_id = ${customer_id},
                due_date = ${due_date},
                total = ${total},
                gst = ${gst}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateCustomerInvoiceById: ${error}`);
        throw error;
    });
}

export async function deleteCustomerInvoiceById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM CUSTOMER_INVOICES WHERE id = ${id}`).catch(
        (error) => {
            logger.error(`deleteCustomerInvoiceById: ${error}`);
            throw error;
        },
    );
}

export async function getCustomerInvoiceById({ id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CUSTOMER_INVOICES.*,
                CUSTOMERS.full_name AS customer_name,
                CUSTOMERS.company AS customer_company
            FROM CUSTOMER_INVOICES
            INNER JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_INVOICES.customer_id
            WHERE CUSTOMER_INVOICES.id = ${id}
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getCustomerInvoiceById: ${error}`);
            return null;
        });
}

export async function getAllCustomerInvoices() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CUSTOMER_INVOICES.*,
                CUSTOMERS.full_name AS customer_name,
                CUSTOMERS.company AS customer_company
            FROM CUSTOMER_INVOICES
            INNER JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_INVOICES.customer_id
            ORDER BY CUSTOMER_INVOICES.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllCustomerInvoices: ${error}`);
            return [];
        });
}
