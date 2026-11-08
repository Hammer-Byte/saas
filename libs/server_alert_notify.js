import { filer, logger } from "@hammerbyte/utils";
import transporter from "./transporter.js";
import { getIstDateTime, getReadableDate } from "./date.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import { getCustomerById } from "../db/customers.js";
import { getCustomerEmailsByCustomerId } from "../db/customer_emails.js";
import { getAllSuperAdminUsers } from "../db/users.js";
import { getServersWithPingAlertEnabled } from "../db/servers.js";

const ALERT_COOLDOWN_MS = 60 * 60 * 1000;
const PING_CHECK_INTERVAL_MS = 60 * 1000;

const lastAlertAtByKey = new Map();

function uniqueEmails(emails) {
    const seen = new Set();
    const recipients = [];
    for (const value of emails) {
        const email = String(value || "").trim();
        if (!email || seen.has(email.toLowerCase())) {
            continue;
        }
        seen.add(email.toLowerCase());
        recipients.push(email);
    }
    return recipients;
}

function formatMegabytes(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return "—";
    }
    return `${amount.toFixed(1)} MB`;
}

function formatPercent(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return "—";
    }
    return amount.toFixed(1);
}

function publicBaseUrl() {
    return String(Bun.env.PUBLIC_BASE_URL || "https://hammerbyte.co.in").replace(/\/$/, "");
}

function cooldownAllows(key) {
    const lastAlertAt = lastAlertAtByKey.get(key) || 0;
    if (Date.now() - lastAlertAt < ALERT_COOLDOWN_MS) {
        return false;
    }
    return true;
}

function markCooldown(key) {
    lastAlertAtByKey.set(key, Date.now());
}

async function resolveAlertRecipients(server) {
    const recipientEmails = [];
    let projectTitle = "—";
    let customerName = "—";

    if (server.project_id) {
        const project = await getCustomerProjectById({ id: server.project_id });
        if (project) {
            projectTitle = project.title || "—";
            const customer = await getCustomerById({ id: project.customer_id });
            customerName = customer?.company || customer?.full_name || "—";
            const customerEmails = await getCustomerEmailsByCustomerId({
                customer_id: project.customer_id,
            });
            recipientEmails.push(...customerEmails);
        }
    }

    const superAdminUsers = await getAllSuperAdminUsers();
    for (const user of superAdminUsers) {
        recipientEmails.push(user.email);
    }

    return {
        recipients: uniqueEmails(recipientEmails),
        projectTitle,
        customerName,
    };
}

function queueAlertEmails({ recipients, subject, html, serverId, kind }) {
    for (const recipient of recipients) {
        transporter.transport({
            recipient,
            subject,
            body: html,
            html_enabled: true,
        });
        logger.info(
            `server ${kind} alert email queued for ${recipient} (server #${serverId})`,
        );
    }
}

export async function notifyServerMetricAlertsIfNeeded({ server, body }) {
    try {
        if (!server?.id || !body || typeof body !== "object") {
            return;
        }
        const payloadType = String(body.type || "").toLowerCase();
        // CPU/memory alerts only on full metrics snapshots (not ping / drive_sync).
        if (payloadType === "drive_sync" || payloadType === "ping") {
            return;
        }

        const checkedAt =
            getReadableDate("DD/MM/YYYY HH:mm:ss", getIstDateTime()) || "—";
        const serverName = server.name || server.tag || `Server #${server.id}`;
        const serverUrl = `${publicBaseUrl()}/app/servers/${server.id}`;
        const hostname = body.hostname || "—";

        const memoryEnabled = Boolean(server.alert_memory_enabled ?? server.alert);
        const memoryThreshold = Number(server.alert_memory_percent);
        const memoryCutoff = Number.isFinite(memoryThreshold) ? memoryThreshold : 90;
        const memory = body.memory && typeof body.memory === "object" ? body.memory : null;
        const memoryPercent = Number(memory?.used_percent);

        if (
            memoryEnabled &&
            Number.isFinite(memoryPercent) &&
            memoryPercent >= memoryCutoff &&
            cooldownAllows(`memory:${server.id}`)
        ) {
            const { recipients, projectTitle, customerName } =
                await resolveAlertRecipients(server);
            if (recipients.length) {
                const html = filer.prepareTemplated("templates/server_memory_alert.html", {
                    server_name: serverName,
                    server_tag: server.tag || "—",
                    project_title: projectTitle,
                    customer_name: customerName,
                    memory_percent: formatPercent(memoryPercent),
                    memory_threshold: formatPercent(memoryCutoff),
                    memory_used: formatMegabytes(memory?.used_mb),
                    memory_total: formatMegabytes(memory?.total_mb),
                    hostname,
                    checked_at: checkedAt,
                    server_url: serverUrl,
                    app_name: "HammerByte",
                });
                queueAlertEmails({
                    recipients,
                    subject: `High memory alert — ${serverName} (${formatPercent(memoryPercent)}%)`,
                    html,
                    serverId: server.id,
                    kind: "memory",
                });
                markCooldown(`memory:${server.id}`);
            }
        }

        const cpuEnabled = Boolean(server.alert_cpu_enabled);
        const cpuThreshold = Number(server.alert_cpu_percent);
        const cpuCutoff = Number.isFinite(cpuThreshold) ? cpuThreshold : 80;
        const processor =
            body.processor && typeof body.processor === "object" ? body.processor : null;
        const cpuPercent = Number(processor?.usage_percent);

        if (
            cpuEnabled &&
            Number.isFinite(cpuPercent) &&
            cpuPercent >= cpuCutoff &&
            cooldownAllows(`cpu:${server.id}`)
        ) {
            const { recipients, projectTitle, customerName } =
                await resolveAlertRecipients(server);
            if (recipients.length) {
                const html = filer.prepareTemplated("templates/server_cpu_alert.html", {
                    server_name: serverName,
                    server_tag: server.tag || "—",
                    project_title: projectTitle,
                    customer_name: customerName,
                    cpu_percent: formatPercent(cpuPercent),
                    cpu_threshold: formatPercent(cpuCutoff),
                    hostname,
                    checked_at: checkedAt,
                    server_url: serverUrl,
                    app_name: "HammerByte",
                });
                queueAlertEmails({
                    recipients,
                    subject: `High CPU alert — ${serverName} (${formatPercent(cpuPercent)}%)`,
                    html,
                    serverId: server.id,
                    kind: "cpu",
                });
                markCooldown(`cpu:${server.id}`);
            }
        }
    } catch (error) {
        logger.error(`notifyServerMetricAlertsIfNeeded: ${error}`);
    }
}

/** @deprecated use notifyServerMetricAlertsIfNeeded */
export async function notifyServerHighMemoryAlertIfNeeded(args) {
    return notifyServerMetricAlertsIfNeeded(args);
}

function parseMysqlDateTimeAsMs(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : null;
    }
    const raw = String(value).trim();
    if (!raw) {
        return null;
    }
    // Stored as IST wall time without zone — treat as local/IST-ish parseable string.
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    const ms = Date.parse(normalized);
    if (Number.isFinite(ms)) {
        return ms;
    }
    const fallback = Date.parse(`${normalized}+05:30`);
    return Number.isFinite(fallback) ? fallback : null;
}

export async function checkServerPingAlerts() {
    try {
        const servers = await getServersWithPingAlertEnabled();
        const now = Date.now();

        for (const server of servers) {
            const seconds = Number(server.alert_ping_seconds);
            const thresholdSeconds = Number.isFinite(seconds) ? seconds : 180;
            const lastSeenMs = parseMysqlDateTimeAsMs(server.last_seen_at);
            if (!lastSeenMs) {
                continue;
            }
            const ageSeconds = Math.floor((now - lastSeenMs) / 1000);
            if (ageSeconds < thresholdSeconds) {
                continue;
            }
            if (!cooldownAllows(`ping:${server.id}`)) {
                continue;
            }

            const { recipients, projectTitle, customerName } =
                await resolveAlertRecipients(server);
            if (!recipients.length) {
                continue;
            }

            const serverName = server.name || server.tag || `Server #${server.id}`;
            const serverUrl = `${publicBaseUrl()}/app/servers/${server.id}`;
            const checkedAt =
                getReadableDate("DD/MM/YYYY HH:mm:ss", getIstDateTime()) || "—";
            const lastSeenReadable =
                getReadableDate("DD/MM/YYYY HH:mm:ss", server.last_seen_at) ||
                String(server.last_seen_at || "—");

            const html = filer.prepareTemplated("templates/server_ping_alert.html", {
                server_name: serverName,
                server_tag: server.tag || "—",
                project_title: projectTitle,
                customer_name: customerName,
                ping_seconds: String(thresholdSeconds),
                age_seconds: String(ageSeconds),
                last_seen_at: lastSeenReadable,
                checked_at: checkedAt,
                server_url: serverUrl,
                app_name: "HammerByte",
            });

            queueAlertEmails({
                recipients,
                subject: `Server offline / no metrics — ${serverName} (>${thresholdSeconds}s)`,
                html,
                serverId: server.id,
                kind: "ping",
            });
            markCooldown(`ping:${server.id}`);
        }
    } catch (error) {
        logger.error(`checkServerPingAlerts: ${error}`);
    }
}

export function startServerPingAlertWatcher() {
    checkServerPingAlerts().catch((error) => {
        logger.error(`startServerPingAlertWatcher initial: ${error}`);
    });
    setInterval(() => {
        checkServerPingAlerts().catch((error) => {
            logger.error(`startServerPingAlertWatcher tick: ${error}`);
        });
    }, PING_CHECK_INTERVAL_MS);
}
