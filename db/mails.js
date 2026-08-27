import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createMail({ application_service_id, recipient, subject, body }) {
    await executeSQLQuery((sql) =>
        sql`INSERT INTO MAILS ${sql(
            { application_service_id, recipient, subject, body },
            "application_service_id",
            "recipient",
            "subject",
            "body",
        )}`,
    ).catch((error) => {
        logger.error(`createMail: ${error}`);
    });
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

export async function getMailsByApplicationServiceIdForInvoice({
    application_service_id,
    start_date,
    end_date,
}) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT COUNT(*) AS count
            FROM MAILS
            WHERE application_service_id = ${application_service_id}
                AND invoiced = FALSE
                AND created_on >= ${start_date}
                AND created_on < DATE_ADD(${end_date}, INTERVAL 1 DAY)
        `,
    )
        .then((result) => Number(result?.[0]?.count ?? 0))
        .catch((error) => {
            logger.error(`getMailsByApplicationServiceIdForInvoice: ${error}`);
            return 0;
        });
}

export async function updateMailsInvoicedByApplicationServiceIdForInvoice({
    application_service_id,
    start_date,
    end_date,
}) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE MAILS
            SET invoiced = TRUE
            WHERE application_service_id = ${application_service_id}
                AND invoiced = FALSE
                AND created_on >= ${start_date}
                AND created_on < DATE_ADD(${end_date}, INTERVAL 1 DAY)
        `,
    ).catch((error) => {
        logger.error(`updateMailsInvoicedByApplicationServiceIdForInvoice: ${error}`);
    });
}
