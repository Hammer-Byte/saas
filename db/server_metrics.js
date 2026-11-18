import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createServerMetric({ server_id, client_timestamp = null, payload }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVER_METRICS ${sql(
                { server_id, client_timestamp, payload },
                "server_id",
                "client_timestamp",
                "payload",
            )}
        `,
    ).catch((error) => {
        logger.error(`createServerMetric: ${error}`);
    });
}

export async function getLatestServerMetricByServerId({ server_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM SERVER_METRICS
            WHERE server_id = ${server_id}
            ORDER BY received_on DESC, id DESC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLatestServerMetricByServerId: ${error}`);
            return null;
        });
}
