import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createEmail({ recipient, subject, body }) {
    await executeSQLQuery((sql) =>
        sql`INSERT INTO MAILER_MESSAGES (recipient, subject, body) VALUES (${recipient}, ${subject}, ${body})`,
    ).catch((error) => {
        logger.error(`createEmail: ${error}`);
        throw error;
    });
}
