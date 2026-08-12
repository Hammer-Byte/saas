import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function getInvoicePaymentsTotalByCustomerInvoiceId({ customer_invoice_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COALESCE(SUM(amount), 0) AS total
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
