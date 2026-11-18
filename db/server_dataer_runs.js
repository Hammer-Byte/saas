import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createServerDataerRun({
    server_id,
    host = null,
    remote = null,
    local_path = null,
    interval_seconds = null,
    success = null,
    result = null,
    duration_seconds = null,
    finished_at = null,
    detail = null,
    client_timestamp = null,
    payload,
}) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVER_DATAER_RUNS ${sql(
                {
                    server_id,
                    host,
                    remote,
                    local_path,
                    interval_seconds,
                    success,
                    result,
                    duration_seconds,
                    finished_at,
                    detail,
                    client_timestamp,
                    payload,
                },
                "server_id",
                "host",
                "remote",
                "local_path",
                "interval_seconds",
                "success",
                "result",
                "duration_seconds",
                "finished_at",
                "detail",
                "client_timestamp",
                "payload",
            )}
        `,
    ).catch((error) => {
        logger.error(`createServerDataerRun: ${error}`);
    });
}

export async function getRecentServerDataerRunsByServerId({ server_id, limit = 25 }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM SERVER_DATAER_RUNS
            WHERE server_id = ${server_id}
            ORDER BY received_on DESC, id DESC
            LIMIT ${limit}
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getRecentServerDataerRunsByServerId: ${error}`);
            return [];
        });
}
