import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createMail(email) {
    await executeSQLQuery((sql) =>
        sql`INSERT INTO MAILS  ${sql(email, "application_service_id", "recipient", "subject", "body")}`,
    ).catch((error) =>
        logger.error(`createEmail: ${error}`)

    )
}

export async function getMailsByApplicationServiceId({ application_service_id, month, year }) {
    logger.info(
        `Getting Mails By Application Service Id : ${application_service_id} For ${year}-${month}`,
    );

    return await executeSQLQuery(
        (sql) => sql`
            SELECT id, application_service_id, recipient, subject, body, created_on
            FROM MAILS
            WHERE application_service_id = ${application_service_id}
              AND MONTH(created_on) = ${month}
              AND YEAR(created_on) = ${year}
            ORDER BY created_on DESC
        `,
    )
        .then((result) => result ?? [])
        .catch((error) => {
            logger.error(`getMailsByApplicationServiceId: ${error}`);
            return [];
        });
}
