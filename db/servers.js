import { logger } from "@hammerbyte/utils";
import { executeSQLQuery } from "../libs/db.js";
import { getIstDateTime } from "../libs/date.js";

function truncate(value, max) {
    if (value == null) {
        return null;
    }
    const text = String(value).trim();
    return text ? text.slice(0, max) : null;
}

export async function createServer({ tag, approval_status = "pending", host = {} }) {
    const row = {
        tag,
        approval_status,
        hostname: truncate(host.hostname, 128),
        os_caption: truncate(host.os_caption, 128),
        os_build: truncate(host.os_build, 32),
        ps_version: truncate(host.ps_version, 16),
        platform_family: truncate(host.platform_family, 32),
    };
    return await executeSQLQuery(
        (sql) => sql`
            INSERT INTO SERVERS ${sql(
                row,
                "tag",
                "approval_status",
                "hostname",
                "os_caption",
                "os_build",
                "ps_version",
                "platform_family",
            )}
        `,
    )
        .then((result) => result.lastInsertRowid)
        .catch((error) => {
            logger.error(`createServer: ${error}`);
            return null;
        });
}

// last_poll_at holds IST wall-clock time; the driver's DATETIME conversion differs between
// parameterised and plain queries, so the age is computed by MySQL against IST "now".
export async function getServerById({ id }) {
    const now = getIstDateTime();
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *, TIMESTAMPDIFF(SECOND, last_poll_at, ${now}) AS seconds_since_poll
            FROM SERVERS WHERE id = ${id}
        `,
    )
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
    const now = getIstDateTime();
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                SERVERS.*,
                TIMESTAMPDIFF(SECOND, SERVERS.last_poll_at, ${now}) AS seconds_since_poll,
                CUSTOMER_PROJECTS.title AS project_title
            FROM SERVERS
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = SERVERS.project_id
            ORDER BY SERVERS.last_poll_at DESC, SERVERS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getAllServers: ${error}`);
            return [];
        });
}

export async function getServersByProjectId({ project_id }) {
    const now = getIstDateTime();
    return await executeSQLQuery(
        (sql) => sql`
            SELECT
                SERVERS.*,
                TIMESTAMPDIFF(SECOND, SERVERS.last_poll_at, ${now}) AS seconds_since_poll,
                CUSTOMER_PROJECTS.title AS project_title
            FROM SERVERS
            LEFT JOIN CUSTOMER_PROJECTS ON CUSTOMER_PROJECTS.id = SERVERS.project_id
            WHERE SERVERS.project_id = ${project_id}
            ORDER BY SERVERS.last_poll_at DESC, SERVERS.created_on DESC
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getServersByProjectId: ${error}`);
            return [];
        });
}

export async function updateServerHostInfoById({ id, host = {} }) {
    const hostname = truncate(host.hostname, 128);
    const os_caption = truncate(host.os_caption, 128);
    const os_build = truncate(host.os_build, 32);
    const ps_version = truncate(host.ps_version, 16);
    const platform_family = truncate(host.platform_family, 32);
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET
                hostname = COALESCE(${hostname}, hostname),
                os_caption = COALESCE(${os_caption}, os_caption),
                os_build = COALESCE(${os_build}, os_build),
                ps_version = COALESCE(${ps_version}, ps_version),
                platform_family = COALESCE(${platform_family}, platform_family)
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerHostInfoById: ${error}`);
    });
}

export async function updateServerPollById({
    id,
    agent_version = null,
    agent_update_status = null,
    agent_update_error = null,
}) {
    const now = getIstDateTime();
    const version = truncate(agent_version, 32);
    const updateStatus = truncate(agent_update_status, 32);
    const updateError = truncate(agent_update_error, 512);
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET
                last_poll_at = ${now},
                last_seen_at = ${now},
                agent_version = COALESCE(${version}, agent_version),
                agent_update_status = ${updateStatus},
                agent_update_error = ${updateError}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerPollById: ${error}`);
    });
}

export async function updateServerApprovalById({ id, approval_status }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET approval_status = ${approval_status}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerApprovalById: ${error}`);
    });
}

export async function updateServerAgentActiveById({ id, agent_active }) {
    await executeSQLQuery(
        (sql) => sql`
            UPDATE SERVERS
            SET agent_active = ${Boolean(agent_active)}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerAgentActiveById: ${error}`);
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

function clampPingSeconds(value, fallback = 180) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return fallback;
    }
    return Math.min(604800, Math.max(60, Math.round(n)));
}

const ALERT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalize to unique lowercase emails; returns null when empty (stored as SQL NULL). */
export function normalizeAlertEmails(value) {
    const list = Array.isArray(value) ? value : [];
    const seen = new Set();
    const emails = [];
    for (const entry of list) {
        const email = String(entry || "")
            .trim()
            .toLowerCase();
        if (!email || !ALERT_EMAIL_PATTERN.test(email) || seen.has(email)) {
            continue;
        }
        seen.add(email);
        emails.push(email);
    }
    return emails.length ? emails : null;
}

export function parseAlertEmailsColumn(value) {
    if (value == null || value === "") {
        return [];
    }
    if (Array.isArray(value)) {
        return normalizeAlertEmails(value) || [];
    }
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return normalizeAlertEmails(parsed) || [];
    } catch {
        return [];
    }
}

export async function updateServerAlertSettingsById({
    id,
    alert_cpu_enabled,
    alert_cpu_percent,
    alert_memory_enabled,
    alert_memory_percent,
    alert_ping_enabled,
    alert_ping_seconds,
    alert_emails,
}) {
    const cpuEnabled = Boolean(alert_cpu_enabled);
    const memoryEnabled = Boolean(alert_memory_enabled);
    const pingEnabled = Boolean(alert_ping_enabled);
    const cpuPercent = clampPercent(alert_cpu_percent, 80);
    const memoryPercent = clampPercent(alert_memory_percent, 80);
    const pingSeconds = clampPingSeconds(alert_ping_seconds, 180);
    const emails = normalizeAlertEmails(alert_emails);
    const emailsJson = emails ? JSON.stringify(emails) : null;

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
                alert_emails = ${emailsJson},
                alert = ${memoryEnabled}
            WHERE id = ${id}
        `,
    ).catch((error) => {
        logger.error(`updateServerAlertSettingsById: ${error}`);
    });
}

/** Cascades to SERVER_METRICS and SERVER_SERVICES via FK. */
export async function deleteServerById({ id }) {
    await executeSQLQuery((sql) => sql`DELETE FROM SERVERS WHERE id = ${id}`).catch((error) => {
        logger.error(`deleteServerById: ${error}`);
    });
}

export async function getServersWithPingAlertEnabled() {
    const now = getIstDateTime();
    return await executeSQLQuery(
        (sql) => sql`
            SELECT *, TIMESTAMPDIFF(SECOND, last_poll_at, ${now}) AS seconds_since_poll
            FROM SERVERS
            WHERE alert_ping_enabled = TRUE
              AND active = TRUE
              AND approval_status = 'approved'
              AND agent_active = TRUE
        `,
    )
        .then((result) => Array.from(result ?? []))
        .catch((error) => {
            logger.error(`getServersWithPingAlertEnabled: ${error}`);
            return [];
        });
}
