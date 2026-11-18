import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";

export async function createServerPing({ server_id, client_timestamp = null, payload }) {
    await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVER_PINGS ${sql(
                { server_id, client_timestamp, payload },
                "server_id",
                "client_timestamp",
                "payload",
            )}
        `,
    ).catch((error) => {
        logger.error(`createServerPing: ${error}`);
    });
}

export async function getLatestServerPingByServerId({ server_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                *,
                TIMESTAMPDIFF(SECOND, received_on, NOW()) AS seconds_since_received
            FROM SERVER_PINGS
            WHERE server_id = ${server_id}
            ORDER BY received_on DESC, id DESC
            LIMIT 1
        `,
    )
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getLatestServerPingByServerId: ${error}`);
            return null;
        });
}
