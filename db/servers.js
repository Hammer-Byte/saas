import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";
import { getIstDateTime } from "../libs/date.js";

export async function createServer({ tag }) {
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVERS ${sql({ tag }, "tag")}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createServer: ${error}`);
        });
}

export async function getServerById({ id }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM SERVERS WHERE id = ${id}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getServerById: ${error}`);
            return null;
        });
}

export async function getServerByTag({ tag }) {
    return await executeSQLQuery((sql) => sql`SELECT * FROM SERVERS WHERE tag = ${tag}`)
        .then((result) => (result.length ? result[0] : null))
        .catch((error) => {
            logger.error(`getServerByTag: ${error}`);
            return null;
        });
}

export async function getAllServers() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                SERVERS.*,
                CUSTOMER_PROJECTS.title AS project_title
            FROM SERVERS
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = SERVERS.project_id
            ORDER BY SERVERS.last_seen_at DESC, SERVERS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllServers: ${error}`);
            return [];
        });
}

export async function getServersByProjectId({ project_id }) {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                SERVERS.*,
                CUSTOMER_PROJECTS.title AS project_title
            FROM SERVERS
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = SERVERS.project_id
            WHERE SERVERS.project_id = ${project_id}
            ORDER BY SERVERS.last_seen_at DESC, SERVERS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getServersByProjectId: ${error}`);
            return [];
        });
}

export async function updateServerLastSeenById({ id, agent_version = null }) {
    const last_seen_at = getIstDateTime();

    if (agent_version == null) {
        await executeSQLQuery(
            (sql) => sql`
                UPDATE SERVERS
                SET last_seen_at = ${last_seen_at}
                WHERE id = ${id}
            `,
        ).catch((error) => {
            logger.error(`updateServerLastSeenById: ${error}`);
        });
        return;
    }

    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET
                last_seen_at = ${last_seen_at},
                agent_version = ${agent_version}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerLastSeenById: ${error}`);
    });
}

export async function updateServerSyncStatusById({
    id,
    last_sync_status = null,
    last_sync_summary = null,
}) {
    // Do not bump last_seen_at here — ping alerts track monitoring metrics only.
    const last_sync_at = getIstDateTime();
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET
                last_sync_at = ${last_sync_at},
                last_sync_status = ${last_sync_status},
                last_sync_summary = ${last_sync_summary}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerSyncStatusById: ${error}`);
    });
}

export async function updateServerNameById({ id, name = null }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET name = ${name}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerNameById: ${error}`);
    });
}

export async function updateServerProjectById({ id, project_id = null }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET project_id = ${project_id}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerProjectById: ${error}`);
    });
}

export async function updateServerAlertById({ id, alert }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET alert = ${alert}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerAlertById: ${error}`);
    });
}

function clampPercent(value, fallback = 80) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return fallback;
    }
    return Math.min(100, Math.max(1, Math.round(n)));
}

function clampPingSeconds(value, fallback = 2700) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return fallback;
    }
    return Math.min(604800, Math.max(60, Math.round(n)));
}

export async function updateServerAlertSettingsById({
    id,
    alert_cpu_enabled,
    alert_cpu_percent,
    alert_memory_enabled,
    alert_memory_percent,
    alert_ping_enabled,
    alert_ping_seconds,
}) {
    const cpuEnabled = Boolean(alert_cpu_enabled);
    const memoryEnabled = Boolean(alert_memory_enabled);
    const pingEnabled = Boolean(alert_ping_enabled);
    const cpuPercent = clampPercent(alert_cpu_percent, 80);
    const memoryPercent = clampPercent(alert_memory_percent, 80);
    const pingSeconds = clampPingSeconds(alert_ping_seconds, 2700);

    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET
                alert_cpu_enabled = ${cpuEnabled},
                alert_cpu_percent = ${cpuPercent},
                alert_memory_enabled = ${memoryEnabled},
                alert_memory_percent = ${memoryPercent},
                alert_ping_enabled = ${pingEnabled},
                alert_ping_seconds = ${pingSeconds},
                alert = ${memoryEnabled}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerAlertSettingsById: ${error}`);
    });
}

export async function getServersWithPingAlertEnabled() {
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *
            FROM SERVERS
            WHERE alert_ping_enabled = TRUE
              AND active = TRUE
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getServersWithPingAlertEnabled: ${error}`);
            return [];
        });
}
