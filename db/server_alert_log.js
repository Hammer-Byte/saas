import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";
import { toDbDate } from "../libs/date.js";

export async function createServerAlertLog({ server_id, kind, detail = null, recipients = null }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVER_ALERT_LOG ${sql(
                {
                    server_id,
                    kind,
                    detail,
                    recipients,
                },
                "server_id",
                "kind",
                "detail",
                "recipients",
            )}
        `,
    ).catch((error) => {
        logger.error(`createServerAlertLog: ${error}`);
    });
}

export async function getServerAlertLogsByServerIdAndDateRange({
    server_id,
    start,
    end,
    limit = 200,
}) {
    const startDate = toDbDate(start);
    const endDate = toDbDate(end);
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM SERVER_ALERT_LOG
            WHERE server_id = ${server_id}
              AND DATE(sent_on) >= ${startDate}
              AND DATE(sent_on) <= ${endDate}
            ORDER BY sent_on DESC, id DESC
            LIMIT ${limit}
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getServerAlertLogsByServerIdAndDateRange: ${error}`);
            return [];
        });
}
