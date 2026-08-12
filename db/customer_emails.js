import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getCustomerEmailsByCustomerId({ customer_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT email
            FROM CUSTOMER_EMAILS
            WHERE customer_id = ${customer_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []).map((row) => row.email))
        .catch((error) => {
            logger.error(`getCustomerEmailsByCustomerId: ${error}`);
            return [];
        });
}

export async function createCustomerEmail({ customer_id, email }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CUSTOMER_EMAILS ${sql({ customer_id, email }, "customer_id", "email")}
        `,
    ).catch((error) => {
        logger.error(`createCustomerEmail: ${error}`);
        throw error;
    });
}

export async function deleteCustomerEmailsByCustomerId({ customer_id }) {
    await executeSQLQuery(
        (sql) => sql`
            DELETE FROM CUSTOMER_EMAILS
            WHERE customer_id = ${customer_id}
        `,
    ).catch((error) => {
        logger.error(`deleteCustomerEmailsByCustomerId: ${error}`);
        throw error;
    });
}
