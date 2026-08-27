import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getCustomerPhonesByCustomerId({ customer_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT phone
            FROM CUSTOMER_PHONES
            WHERE customer_id = ${customer_id}
            ORDER BY id ASC
        `,
    )
        .then((result) => Array.from(result ?? []).map((row) => row.phone))
        .catch((error) => {
            logger.error(`getCustomerPhonesByCustomerId: ${error}`);
            return [];
        });
}

export async function createCustomerPhone({ customer_id, phone }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO CUSTOMER_PHONES ${sql({ customer_id, phone }, "customer_id", "phone")}
        `,
    ).catch((error) => {
        logger.error(`createCustomerPhone: ${error}`);
    });
}

export async function deleteCustomerPhonesByCustomerId({ customer_id }) {
    await executeSQLQuery(
        (sql) => sql`
            DELETE FROM CUSTOMER_PHONES
            WHERE customer_id = ${customer_id}
        `,
    ).catch((error) => {
        logger.error(`deleteCustomerPhonesByCustomerId: ${error}`);
    });
}
