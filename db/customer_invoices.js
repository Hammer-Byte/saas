import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createCustomerInvoice({ customer_id, project_id, due_date }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CUSTOMER_INVOICES ${sql(
                { customer_id, project_id, due_date },
                "customer_id",
                "project_id",
                "due_date",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createCustomerInvoice: ${error}`);
            throw error;
        });
}

export async function updateCustomerInvoiceById({
    id,
    customer_id,
    project_id,
    due_date,
    total,
    gst,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CUSTOMER_INVOICES
            SET
                customer_id = ${customer_id},
                project_id = ${project_id},
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

export async function updateCustomerInvoiceTotalById({ id, total, gst }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CUSTOMER_INVOICES
            SET
                total = ${total},
                gst = ${gst}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateCustomerInvoiceTotalById: ${error}`);
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
                CUSTOMERS.company AS customer_company,
                CUSTOMER_PROJECTS.title AS project_title
            FROM CUSTOMER_INVOICES
            INNER JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_INVOICES.customer_id
            INNER JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = CUSTOMER_INVOICES.project_id
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
                CUSTOMERS.company AS customer_company,
                CUSTOMER_PROJECTS.title AS project_title
            FROM CUSTOMER_INVOICES
            INNER JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_INVOICES.customer_id
            INNER JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = CUSTOMER_INVOICES.project_id
            ORDER BY CUSTOMER_INVOICES.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllCustomerInvoices: ${error}`);
            return [];
        });
}

export async function getCustomerInvoicesByProjectId({ project_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                CUSTOMER_INVOICES.*,
                CUSTOMERS.full_name AS customer_name,
                CUSTOMERS.company AS customer_company,
                CUSTOMER_PROJECTS.title AS project_title
            FROM CUSTOMER_INVOICES
            INNER JOIN CUSTOMERS ON CUSTOMERS.id = CUSTOMER_INVOICES.customer_id
            INNER JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = CUSTOMER_INVOICES.project_id
            WHERE CUSTOMER_INVOICES.project_id = ${project_id}
            ORDER BY CUSTOMER_INVOICES.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getCustomerInvoicesByProjectId: ${error}`);
            return [];
        });
}

export async function getCustomerInvoiceByCustomerProjectAndMonth({
    customer_id,
    project_id,
    year,
    month,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM CUSTOMER_INVOICES
            WHERE customer_id = ${customer_id}
                AND project_id = ${project_id}
                AND YEAR(due_date) = ${year}
                AND MONTH(due_date) = ${month}
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getCustomerInvoiceByCustomerProjectAndMonth: ${error}`);
            return null;
        });
}

