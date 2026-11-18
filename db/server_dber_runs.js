import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createServerDberRun({
    server_id,
    from_host = null,
    from_database = null,
    to_host = null,
    to_database = null,
    interval_seconds = null,
    success = null,
    result = null,
    duration_seconds = null,
    finished_at = null,
    bacpac_path = null,
    detail = null,
    client_timestamp = null,
    payload,
}) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVER_DBER_RUNS ${sql(
                {
                    server_id,
                    from_host,
                    from_database,
                    to_host,
                    to_database,
                    interval_seconds,
                    success,
                    result,
                    duration_seconds,
                    finished_at,
                    bacpac_path,
                    detail,
                    client_timestamp,
                    payload,
                },
                "server_id",
                "from_host",
                "from_database",
                "to_host",
                "to_database",
                "interval_seconds",
                "success",
                "result",
                "duration_seconds",
                "finished_at",
                "bacpac_path",
                "detail",
                "client_timestamp",
                "payload",
            )}
        `,
    ).catch((error) => {
        logger.error(`createServerDberRun: ${error}`);
    });
}

export async function getRecentServerDberRunsByServerId({ server_id, limit = 25 }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM SERVER_DBER_RUNS
            WHERE server_id = ${server_id}
            ORDER BY received_on DESC, id DESC
            LIMIT ${limit}
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getRecentServerDberRunsByServerId: ${error}`);
            return [];
        });
}
