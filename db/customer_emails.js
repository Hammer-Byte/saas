import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getCustomerEmailByCustomerId({ customer_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT email
            FROM CUSTOMER_EMAILS
            WHERE customer_id = ${customer_id}
            ORDER BY id ASC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0].email : null))
        .catch((error) => {
            logger.error(`getCustomerEmailByCustomerId: ${error}`);
            return null;
        });
}
