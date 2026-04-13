import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createMail(email) {
    await executeSQLQuery((sql) =>
        sql`INSERT INTO MAILS  ${sql(email, "application_service_id", "recipient", "subject", "body")}`,
    ).catch((error) =>
        logger.error(`createEmail: ${error}`)

    )
}
