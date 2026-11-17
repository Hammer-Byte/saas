import { filer, logger } from "@hammerbyte/utils";
import transporter from "./transporter.js";
import { getIstDateTime, getReadableDate } from "./date.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import { getCustomerById } from "../db/customers.js";
import { getCustomerEmailsByCustomerId } from "../db/customer_emails.js";
import { getAllSuperAdminUsers } from "../db/users.js";
import { getServersWithPingAlertEnabled } from "../db/servers.js";
import { getServerService } from "../db/server_services.js";

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

function parseStoredAlertEmails(value) {
    if (value == null || value === "") {
        return [];
    }
    if (Array.isArray(value)) {
        return uniqueEmails(value.map((entry) => String(entry || "").trim().toLowerCase()));
    }
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return uniqueEmails(parsed.map((entry) => String(entry || "").trim().toLowerCase()));
    } catch {
        return [];
    }
}

/** Candidate emails for the Alerts UI (not sent unless selected and saved). */
export async function listServerAlertCandidates({ server }) {
    const candidates = [];
    const seen = new Set();

    const add = (email, source, label = null) => {
        const normalized = String(email || "")
            .trim()
            .toLowerCase();
        if (!normalized || seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        candidates.push({ email: normalized, source, label });
    };

    if (server?.project_id) {
        const project = await getCustomerProjectById({ id: server.project_id });
        if (project) {
            const customerEmails = await getCustomerEmailsByCustomerId({
                customer_id: project.customer_id,
            });
            for (const email of customerEmails) {
                add(email, "customer");
            }
        }
    }

    const superAdminUsers = await getAllSuperAdminUsers();
    for (const user of superAdminUsers) {
        add(user.email, "super_admin", user.full_name || null);
    }

    return candidates;
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

async function resolveAlertContext(server) {
    let projectTitle = "—";
    let customerName = "—";

    if (server.project_id) {
        const project = await getCustomerProjectById({ id: server.project_id });
        if (project) {
            projectTitle = project.title || "—";
            const customer = await getCustomerById({ id: project.customer_id });
            customerName = customer?.company || customer?.full_name || "—";
        }
    }

    return { projectTitle, customerName };
}

/**
 * Prefer service config.alert_emails when that key exists; otherwise fall back to
 * SERVERS.alert_emails (legacy). Empty array means intentionally no recipients.
 */
async function resolveAlertRecipients(server, serviceConfig) {
    const { projectTitle, customerName } = await resolveAlertContext(server);
    let recipients;
    if (
        serviceConfig != null &&
        Object.prototype.hasOwnProperty.call(serviceConfig, "alert_emails")
    ) {
        recipients = parseStoredAlertEmails(serviceConfig.alert_emails);
    } else {
        recipients = parseStoredAlertEmails(server.alert_emails);
    }
    return {
        recipients,
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

function formatBytes(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        return "—";
    }
    if (amount < 1024) {
        return `${Math.round(amount)} B`;
    }
    if (amount < 1024 * 1024) {
        return `${(amount / 1024).toFixed(1)} KB`;
    }
    if (amount < 1024 * 1024 * 1024) {
        return `${(amount / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(amount / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds) {
    const total = Number(seconds);
    if (!Number.isFinite(total) || total < 0) {
        return "—";
    }
    const whole = Math.round(total);
    if (whole < 60) {
        return `${whole}s`;
    }
    const minutes = Math.floor(whole / 60);
    const rem = whole % 60;
    if (minutes < 60) {
        return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    return remMin ? `${hours}h ${remMin}m` : `${hours}h`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatDriveSyncPairsHtml(pairs) {
    if (!Array.isArray(pairs) || pairs.length === 0) {
        return "<div>No drive pairs.</div>";
    }
    return pairs
        .map((pair) => {
            const source = escapeHtml(pair.source || `\\\\…\\${pair.share || "?"}`);
            const destination = escapeHtml(pair.destination || pair.local_path || "?");
            const status = pair.status ? ` — ${escapeHtml(pair.status)}` : "";
            const stats =
                pair.copied != null
                    ? ` (copied ${Number(pair.copied) || 0}, skipped ${Number(pair.skipped) || 0}, purged ${Number(pair.purged) || 0}, failed ${Number(pair.failed) || 0})`
                    : "";
            const interval =
                pair.interval_seconds != null ? ` · interval ${Number(pair.interval_seconds) || 0}s` : "";
            const nextRun = pair.next_run_at_ist
                ? ` · next ${escapeHtml(pair.next_run_at_ist)}`
                : "";
            return `<div><code>${source}</code> → <code>${destination}</code>${status}${stats}${interval}${nextRun}</div>`;
        })
        .join("");
}

/** Drive Sync start/complete emails. No cooldown — each cycle may notify when enabled. */
export async function notifyDriveSyncAlertsIfNeeded({ server, body, config }) {
    try {
        if (!server?.id || !body || typeof body !== "object") {
            return;
        }
        const type = String(body.type || "").toLowerCase();
        if (type !== "sync_start" && type !== "sync_run") {
            return;
        }

        const alertOnStart = config?.alert_on_start !== false;
        const alertOnComplete = config?.alert_on_complete !== false;
        if (type === "sync_start" && !alertOnStart) {
            return;
        }
        if (type === "sync_run" && !alertOnComplete) {
            return;
        }

        const { recipients, projectTitle, customerName } = await resolveAlertRecipients(
            server,
            config,
        );
        if (!recipients.length) {
            logger.info(
                `server #${server.id} drivesync ${type} alert skipped: no alert_emails selected`,
            );
            return;
        }

        const serverName = server.name || server.tag || `Server #${server.id}`;
        const serverUrl = `${publicBaseUrl()}/app/servers/${server.id}`;
        const sourceHost = body.source_host || "—";
        const pairsHtml = formatDriveSyncPairsHtml(body.pairs);

        if (type === "sync_start") {
            const html = filer.prepareTemplated("templates/server_drivesync_start_alert.html", {
                server_name: serverName,
                server_tag: server.tag || "—",
                project_title: projectTitle,
                customer_name: customerName,
                source_host: sourceHost,
                pair_count: String(body.pair_count ?? (Array.isArray(body.pairs) ? body.pairs.length : 0)),
                pairs_html: pairsHtml,
                started_at: body.started_at_ist || "—",
                interval_seconds: String(body.interval_seconds ?? "—"),
                hostname: body.hostname || "—",
                server_url: serverUrl,
                app_name: "HammerByte",
            });
            queueAlertEmails({
                recipients,
                subject: `Drive Sync started — ${serverName} ← ${sourceHost}`,
                html,
                serverId: server.id,
                kind: "drivesync_start",
            });
            return;
        }

        const totals = body.totals && typeof body.totals === "object" ? body.totals : {};
        const copied = Number(totals.copied) || 0;
        const skipped = Number(totals.skipped) || 0;
        const purged = Number(totals.purged) || 0;
        const failed = Number(totals.failed) || 0;
        const mismatched = Number(totals.mismatched) || 0;
        const filesSeen =
            Number.isFinite(Number(body.files_seen))
                ? Number(body.files_seen)
                : copied + skipped + purged + failed + mismatched;
        const status = String(body.status || "unknown");
        const html = filer.prepareTemplated("templates/server_drivesync_complete_alert.html", {
            server_name: serverName,
            server_tag: server.tag || "—",
            project_title: projectTitle,
            customer_name: customerName,
            source_host: sourceHost,
            status,
            files_seen: String(filesSeen),
            copied: String(copied),
            skipped: String(skipped),
            purged: String(purged),
            failed: String(failed),
            bytes_copied: formatBytes(totals.bytes_copied),
            duration: formatDuration(body.duration_seconds),
            started_at: body.started_at_ist || "—",
            finished_at: body.finished_at_ist || "—",
            next_run_at: body.next_run_at_ist || "—",
            interval_seconds: String(body.interval_seconds ?? "—"),
            pairs_html: pairsHtml,
            error_block: body.error
                ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px;font-size:14px;line-height:1.6;color:#991b1b;"><strong>Error:</strong> ${escapeHtml(body.error)}</div>`
                : "",
            hostname: body.hostname || "—",
            server_url: serverUrl,
            app_name: "HammerByte",
        });
        const subjectStatus = status === "ok" ? "completed" : status;
        queueAlertEmails({
            recipients,
            subject: `Drive Sync ${subjectStatus} — ${serverName}: ${copied} synced / ${filesSeen} seen`,
            html,
            serverId: server.id,
            kind: "drivesync_complete",
        });
    } catch (error) {
        logger.error(`notifyDriveSyncAlertsIfNeeded: ${error}`);
    }
}

export async function notifyServerMetricAlertsIfNeeded({ server, body }) {
    try {
        if (!server?.id || !body || typeof body !== "object") {
            return;
        }
        if (String(body.type || "").toLowerCase() !== "metrics") {
            return;
        }

        const monitorRow = await getServerService({
            server_id: server.id,
            service: "monitor",
        });
        const monitorConfig = monitorRow?.config || {};

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
            const { recipients, projectTitle, customerName } = await resolveAlertRecipients(
                server,
                monitorConfig,
            );
            if (!recipients.length) {
                logger.info(
                    `server #${server.id} memory alert skipped: no alert_emails selected`,
                );
            } else {
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
            const { recipients, projectTitle, customerName } = await resolveAlertRecipients(
                server,
                monitorConfig,
            );
            if (!recipients.length) {
                logger.info(
                    `server #${server.id} cpu alert skipped: no alert_emails selected`,
                );
            } else {
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

export async function checkServerPingAlerts() {
    try {
        const servers = await getServersWithPingAlertEnabled();

        for (const server of servers) {
            const seconds = Number(server.alert_ping_seconds);
            const thresholdSeconds = Number.isFinite(seconds) ? seconds : 180;
            if (server.seconds_since_poll == null) {
                continue;
            }
            const ageSeconds = Number(server.seconds_since_poll);
            if (ageSeconds < thresholdSeconds) {
                continue;
            }
            if (!cooldownAllows(`ping:${server.id}`)) {
                continue;
            }

            const monitorRow = await getServerService({
                server_id: server.id,
                service: "monitor",
            });
            const { recipients, projectTitle, customerName } = await resolveAlertRecipients(
                server,
                monitorRow?.config || {},
            );
            if (!recipients.length) {
                logger.info(
                    `server #${server.id} ping alert skipped: no alert_emails selected`,
                );
                markCooldown(`ping:${server.id}`);
                continue;
            }

            const serverName = server.name || server.tag || `Server #${server.id}`;
            const serverUrl = `${publicBaseUrl()}/app/servers/${server.id}`;
            const checkedAt =
                getReadableDate("DD/MM/YYYY HH:mm:ss", getIstDateTime()) || "—";
            const lastSeenReadable =
                getReadableDate("DD/MM/YYYY HH:mm:ss", server.last_poll_at) ||
                String(server.last_poll_at || "—");

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
                subject: `Server offline / agent silent — ${serverName} (>${thresholdSeconds}s)`,
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
