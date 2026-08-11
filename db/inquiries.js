import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createInquiry({ full_name, phone, email = null }) {
    await executeSQLQuery((sql) =>
        sql`INSERT INTO INQUIRIES ${sql({ full_name, phone, email }, "full_name", "phone", "email")}`,
    ).catch((error) => {
        logger.error(`createInquiry: ${error}`);
        throw error;
    });
}

export async function getAllInquiries() {
    logger.info("Getting All Inquiries");
    return await executeSQLQuery((sql) => sql`SELECT * FROM INQUIRIES ORDER BY created_on DESC`)
        .then((result) => result ?? [])
        .catch((error) => {
            logger.error(`getAllInquiries: ${error}`);
            return [];
        });
}
