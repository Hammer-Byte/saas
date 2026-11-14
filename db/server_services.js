import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";
import { getIstDateTime } from "../libs/date.js";

function parseConfig(row) {
    if (!row) {
        return row;
    }
    let config = {};
    try {
        config = typeof row.config === "string" ? JSON.parse(row.config) : row.config || {};
    } catch {
        config = {};
    }
    return { ...row, config, enabled: Boolean(row.enabled) };
}

export async function getServerServicesByServerId({ server_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT * FROM SERVER_SERVICES
            WHERE server_id = ${server_id}
            ORDER BY service
        `,
    )
        .then((result) => Array.from(result ?? []).map(parseConfig))
        .catch((error) => {
            logger.error(`getServerServicesByServerId: ${error}`);
            return [];
        });
}

export async function getAllServerServices() {
    return await executeSQLQuery((sql) => sql`SELECT * FROM SERVER_SERVICES`)
        .then((result) => Array.from(result ?? []).map(parseConfig))
        .catch((error) => {
            logger.error(`getAllServerServices: ${error}`);
            return [];
        });
}

export async function getServerService({ server_id, service }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT * FROM SERVER_SERVICES
            WHERE server_id = ${server_id} AND service = ${service}
        `,
    )
        .then((result) => (result.length ? parseConfig(result[0]) : null))
        .catch((error) => {
            logger.error(`getServerService: ${error}`);
            return null;
        });
}

/** Insert a disabled row with default config if missing. */
export async function ensureServerService({ server_id, service, config }) {
    const payload = JSON.stringify(config ?? {});
    await executeSQLQuery(
        (sql) => sql`
            INSERT IGNORE INTO SERVER_SERVICES (server_id, service, enabled, config, config_version)
            VALUES (${server_id}, ${service}, FALSE, ${payload}, 1)
        `,
    ).catch((error) => {
        logger.error(`ensureServerService: ${error}`);
    });
}

export async function updateServerServiceSettings({ id, enabled, config, bump_version }) {
    const payload = JSON.stringify(config ?? {});
    const bump = bump_version ? 1 : 0;
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVER_SERVICES
            SET
                enabled = ${Boolean(enabled)},
                config = ${payload},
                config_version = config_version + ${bump}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerServiceSettings: ${error}`);
    });
}

export async function updateServerServiceStatus({
    server_id,
    service,
    state,
    pid,
    running_script_version,
    running_config_version,
    restarts,
    last_error,
}) {
    const now = getIstDateTime();
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVER_SERVICES
            SET
                state = ${state},
                pid = ${pid},
                running_script_version = ${running_script_version},
                running_config_version = ${running_config_version},
                restarts = ${restarts},
                last_error = ${last_error},
                last_status_at = ${now}
            WHERE server_id = ${server_id} AND service = ${service}
        `,
    ).catch((error) => {
        logger.error(`updateServerServiceStatus: ${error}`);
    });
}

export async function touchServerServiceResult({ server_id, service }) {
    const now = getIstDateTime();
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVER_SERVICES
            SET last_result_at = ${now}
            WHERE server_id = ${server_id} AND service = ${service}
        `,
    ).catch((error) => {
        logger.error(`touchServerServiceResult: ${error}`);
    });
}
