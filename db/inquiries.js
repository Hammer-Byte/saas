import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createInquiry(inquiry) {
    await executeSQLQuery((sql) =>
        sql`INSERT INTO INQUIRIES ${sql(inquiry, "full_name", "phone", "email")}`,
    ).catch((error) => {
        logger.error(`createInquiry: ${error}`);
        throw error;
    });
}
