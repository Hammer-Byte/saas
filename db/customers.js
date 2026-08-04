import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createCustomer({ full_name, company, pan_gst, hsn, address }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CUSTOMERS ${sql(
                { full_name, company, pan_gst, hsn, address },
                "full_name",
                "company",
                "pan_gst",
                "hsn",
                "address",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createCustomer: ${error}`);
            throw error;
        });
}

export async function updateCustomerById({ id, full_name, company, pan_gst, hsn, address }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE CUSTOMERS
            SET
                full_name = ${full_name},
                company = ${company},
                pan_gst = ${pan_gst},
                hsn = ${hsn},
                address = ${address}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateCustomerById: ${error}`);
        throw error;
    });
}

export async function deleteCustomerById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM CUSTOMERS WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteCustomerById: ${error}`);
        throw error;
    });
}

export async function getCustomerById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM CUSTOMERS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getCustomerById: ${error}`);
            return null;
        });
}

export async function getAllCustomers() {
    return await executeSQLQuery((sql) => sql`SELECT * FROM CUSTOMERS ORDER BY created_on DESC`)
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllCustomers: ${error}`);
            return [];
        });
}
