import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getCustomerPhoneByCustomerId({ customer_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT phone
            FROM CUSTOMER_PHONES
            WHERE customer_id = ${customer_id}
            ORDER BY id ASC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0].phone : null))
        .catch((error) => {
            logger.error(`getCustomerPhoneByCustomerId: ${error}`);
            return null;
        });
}
