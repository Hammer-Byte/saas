import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createServerMetric({ server_id, payload }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVER_METRICS ${sql({ server_id, payload }, "server_id", "payload")}
        `,
    ).catch((error) => {
        logger.error(`createServerMetric: ${error}`);
    });
}

export async function getServerMetricsByServerId({ server_id, limit = 200 }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT * FROM SERVER_METRICS
            WHERE server_id = ${server_id}
            ORDER BY collected_at DESC
            LIMIT ${limit}
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getServerMetricsByServerId: ${error}`);
            return [];
        });
}

export async function deleteServerMetricsByServerIds({ server_ids }) {
    await executeSQLQuery(
        (sql) => sql`
            DELETE FROM SERVER_METRICS
            WHERE server_id IN ${sql(server_ids)}
        `,
    ).catch((error) => {
        logger.error(`deleteServerMetricsByServerIds: ${error}`);
    });
}

export async function deleteServerMetricsByServerIdsAndDateRange({
    server_ids,
    from_date,
    to_date,
}) {
    await executeSQLQuery(
        (sql) => sql`
            DELETE FROM SERVER_METRICS
            WHERE server_id IN ${sql(server_ids)}
              AND DATE(collected_at) >= ${from_date}
              AND DATE(collected_at) <= ${to_date}
        `,
    ).catch((error) => {
        logger.error(`deleteServerMetricsByServerIdsAndDateRange: ${error}`);
    });
}
