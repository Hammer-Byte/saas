import { filer, logger } from "@hammerbyte/utils";
import { createServerAlertLog } from "../db/server_alert_log.js";
import { getLatestServerPingByServerId } from "../db/server_pings.js";
import {
    getServerById,
    updateServerAlertStateById,
} from "../db/servers.js";
import {
    cooldownElapsed,
    cpuUsagePercent,
    maxTemperatureCelsius,
    memoryUsagePercent,
    parseAlertConfig,
    parseAlertState,
    storageOverThreshold,
} from "./server_alerts.js";
import { resolveServiceRunStatus } from "./server_run_status.js";
import transporter from "./transporter.js";

const METRICER_REQUIRES_PING_WITHIN_SECONDS = 180;

function publicBaseUrl() {
    return String(Bun.env.PUBLIC_BASE_URL || "https://hammerbyte.co.in").replace(/\/$/, "");
}

function serverUrl(serverId) {
    return `${publicBaseUrl()}/app/servers/${Number(serverId)}`;
}

function stampNow() {
    return new Date().toISOString();
}

async function stampAlertState(serverId, currentState, key) {
    const next = { ...parseAlertState(currentState), [key]: stampNow() };
    await updateServerAlertStateById({ id: serverId, alert_state: next });
    return next;
}

function sendSmsStub({ phone, message }) {
    logger.info(`server alert SMS stub → ${phone}: ${message}`);
}

function metricEmailHtml({ recipientName, server, alertTitle, alertDetail, capturedAt }) {
    return filer.prepareTemplated("templates/server_metric_alert.html", {
        recipient_name: recipientName,
        server_name: server.name || "—",
        server_location: server.location || "—",
        alert_title: alertTitle,
        alert_detail: alertDetail,
        captured_at: capturedAt || "—",
        server_url: serverUrl(server.id),
        app_name: "HammerByte",
    });
}

function recipientCanNotify(recipient) {
    return Boolean(
        (recipient?.email_on && recipient?.email) || (recipient?.sms_on && recipient?.phone),
    );
}

function notifySection({ server, recipients, subject, htmlBuilder, smsMessage }) {
    const list = Array.isArray(recipients) ? recipients : [];
    let sent = 0;
    const delivered = [];
    for (const recipient of list) {
        const name = recipient.name || "there";
        if (recipient.email_on && recipient.email) {
            transporter.transport({
                recipient: recipient.email,
                subject,
                body: htmlBuilder(name),
                html_enabled: true,
            });
            sent += 1;
            delivered.push(`${name} <${recipient.email}> email`);
        }
        if (recipient.sms_on && recipient.phone) {
            sendSmsStub({ phone: recipient.phone, message: smsMessage });
            sent += 1;
            delivered.push(`${name} <${recipient.phone}> sms`);
        }
    }
    return { sent, recipientsText: delivered.join("; ") };
}

async function logDeliveredAlert({ server, kind, detail, delivery }) {
    if (!delivery?.sent) {
        return false;
    }
    await createServerAlertLog({
        server_id: server.id,
        kind,
        detail: detail || null,
        recipients: delivery.recipientsText || null,
    });
    return true;
}

async function serverHasRecentPing(serverId, withinSeconds) {
    const latestPing = await getLatestServerPingByServerId({ server_id: serverId });
    const age =
        latestPing?.seconds_since_received == null
            ? null
            : Number(latestPing.seconds_since_received);
    if (age == null || !Number.isFinite(age)) {
        return false;
    }
    return age <= withinSeconds;
}

/**
 * Each Metricer condition is fully independent (own cooldown / notify / log).
 * Metricer alerts only run when a recent ping shows the host is reachable.
 */
export async function evaluateMetricerAlerts({ server, payload }) {
    if (!server?.id || !payload || typeof payload !== "object") {
        return;
    }

    const config = parseAlertConfig(server.alert_config);
    const metricer = config.metricer;
    if (!metricer.enabled) {
        logger.info(`server #${server.id} metricer alerts skipped: disabled`);
        return;
    }
    if (!metricer.recipients.length) {
        logger.info(`server #${server.id} metricer alerts skipped: no recipients`);
        return;
    }
    if (!metricer.recipients.some(recipientCanNotify)) {
        logger.info(`server #${server.id} metricer alerts skipped: no email/SMS enabled`);
        return;
    }

    const pingWithin = Math.max(
        30,
        Number(config.pinger?.missed_ping_seconds) || METRICER_REQUIRES_PING_WITHIN_SECONDS,
    );
    try {
        const alive = await serverHasRecentPing(server.id, pingWithin);
        if (!alive) {
            logger.info(
                `server #${server.id} metricer alerts skipped: no ping within ${pingWithin}s`,
            );
            return;
        }
    } catch (error) {
        logger.error(`evaluateMetricerAlerts ping gate: ${error}`);
        return;
    }

    let state = parseAlertState(server.alert_state);
    const capturedAt = payload.capturedAt || payload.timestamp || "—";
    const cooldown = metricer.cooldown_seconds;
    const recipients = metricer.recipients;

    // --- RAM (independent) ---
    if (metricer.ram_enabled) {
        try {
            const ramPct = memoryUsagePercent(payload);
            if (ramPct == null) {
                logger.info(`server #${server.id} metricer RAM skipped: no memory data`);
            } else if (ramPct < metricer.ram_percent) {
                logger.info(
                    `server #${server.id} metricer RAM ok: ${ramPct.toFixed(1)}% < ${metricer.ram_percent}%`,
                );
            } else if (!cooldownElapsed(state.metricer_ram, cooldown)) {
                logger.info(`server #${server.id} metricer RAM skipped: cooldown`);
            } else {
                const detail = `RAM usage ${ramPct.toFixed(1)}% (threshold ${metricer.ram_percent}%)`;
                const delivery = notifySection({
                    server,
                    recipients,
                    subject: `Server RAM alert — ${server.name}`,
                    htmlBuilder: (recipientName) =>
                        metricEmailHtml({
                            recipientName,
                            server,
                            alertTitle: "RAM",
                            alertDetail: detail,
                            capturedAt,
                        }),
                    smsMessage: `HammerByte: ${server.name} RAM ${ramPct.toFixed(0)}% >= ${metricer.ram_percent}%`,
                });
                if (await logDeliveredAlert({ server, kind: "metricer_ram", detail, delivery })) {
                    state = await stampAlertState(server.id, state, "metricer_ram");
                    logger.info(`server #${server.id} metricer RAM alert sent (${detail})`);
                }
            }
        } catch (error) {
            logger.error(`server #${server.id} metricer RAM check failed: ${error}`);
        }
    }

    // --- CPU (independent) ---
    if (metricer.cpu_enabled) {
        try {
            const cpuPct = cpuUsagePercent(payload);
            if (cpuPct == null) {
                logger.info(`server #${server.id} metricer CPU skipped: no usage data`);
            } else if (cpuPct < metricer.cpu_percent) {
                logger.info(
                    `server #${server.id} metricer CPU ok: ${cpuPct.toFixed(1)}% < ${metricer.cpu_percent}%`,
                );
            } else if (!cooldownElapsed(state.metricer_cpu, cooldown)) {
                logger.info(`server #${server.id} metricer CPU skipped: cooldown`);
            } else {
                const detail = `CPU usage ${cpuPct.toFixed(1)}% (threshold ${metricer.cpu_percent}%)`;
                const delivery = notifySection({
                    server,
                    recipients,
                    subject: `Server CPU alert — ${server.name}`,
                    htmlBuilder: (recipientName) =>
                        metricEmailHtml({
                            recipientName,
                            server,
                            alertTitle: "CPU",
                            alertDetail: detail,
                            capturedAt,
                        }),
                    smsMessage: `HammerByte: ${server.name} CPU ${cpuPct.toFixed(0)}% >= ${metricer.cpu_percent}%`,
                });
                if (await logDeliveredAlert({ server, kind: "metricer_cpu", detail, delivery })) {
                    state = await stampAlertState(server.id, state, "metricer_cpu");
                    logger.info(`server #${server.id} metricer CPU alert sent (${detail})`);
                }
            }
        } catch (error) {
            logger.error(`server #${server.id} metricer CPU check failed: ${error}`);
        }
    }

    // --- Storage (independent) ---
    if (metricer.storage_enabled) {
        try {
            const offenders = storageOverThreshold(
                payload,
                metricer.storage_percent,
                metricer.storage_drives,
            );
            if (!offenders.length) {
                logger.info(`server #${server.id} metricer storage ok: under ${metricer.storage_percent}%`);
            } else if (!cooldownElapsed(state.metricer_storage, cooldown)) {
                logger.info(`server #${server.id} metricer storage skipped: cooldown`);
            } else {
                const detail = offenders
                    .map(
                        (disk) =>
                            `${disk.name}${disk.label ? ` (${disk.label})` : ""} ${disk.used_percent}% used`,
                    )
                    .join("; ");
                const fullDetail = `${detail} (threshold ${metricer.storage_percent}%)`;
                const delivery = notifySection({
                    server,
                    recipients,
                    subject: `Server storage alert — ${server.name}`,
                    htmlBuilder: (recipientName) =>
                        metricEmailHtml({
                            recipientName,
                            server,
                            alertTitle: "Storage",
                            alertDetail: fullDetail,
                            capturedAt,
                        }),
                    smsMessage: `HammerByte: ${server.name} storage over ${metricer.storage_percent}%`,
                });
                if (
                    await logDeliveredAlert({
                        server,
                        kind: "metricer_storage",
                        detail: fullDetail,
                        delivery,
                    })
                ) {
                    state = await stampAlertState(server.id, state, "metricer_storage");
                    logger.info(`server #${server.id} metricer storage alert sent (${detail})`);
                }
            }
        } catch (error) {
            logger.error(`server #${server.id} metricer storage check failed: ${error}`);
        }
    }

    // --- Temperature (independent) ---
    if (metricer.temp_enabled) {
        try {
            const temp = maxTemperatureCelsius(payload);
            if (temp == null) {
                logger.info(`server #${server.id} metricer temp skipped: no temperature data`);
            } else if (temp < metricer.temp_celsius) {
                logger.info(
                    `server #${server.id} metricer temp ok: ${temp.toFixed(1)}°C < ${metricer.temp_celsius}°C`,
                );
            } else if (!cooldownElapsed(state.metricer_temp, cooldown)) {
                logger.info(`server #${server.id} metricer temp skipped: cooldown`);
            } else {
                const detail = `Temperature ${temp.toFixed(1)}°C (threshold ${metricer.temp_celsius}°C)`;
                const delivery = notifySection({
                    server,
                    recipients,
                    subject: `Server temperature alert — ${server.name}`,
                    htmlBuilder: (recipientName) =>
                        metricEmailHtml({
                            recipientName,
                            server,
                            alertTitle: "Temperature",
                            alertDetail: detail,
                            capturedAt,
                        }),
                    smsMessage: `HammerByte: ${server.name} temp ${temp.toFixed(0)}C >= ${metricer.temp_celsius}C`,
                });
                if (await logDeliveredAlert({ server, kind: "metricer_temp", detail, delivery })) {
                    state = await stampAlertState(server.id, state, "metricer_temp");
                    logger.info(`server #${server.id} metricer temp alert sent (${detail})`);
                }
            }
        } catch (error) {
            logger.error(`server #${server.id} metricer temp check failed: ${error}`);
        }
    }
}

function asDisplayText(value, maxLength = 512) {
    const text = String(value ?? "").trim();
    if (!text) {
        return "—";
    }
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function escapeAlertDetailHtml(detail) {
    return String(detail || "")
        .split("\n")
        .map((line) =>
            String(line)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;"),
        )
        .join("<br>");
}

function formatDurationSeconds(value) {
    if (value == null || !Number.isFinite(Number(value))) {
        return "—";
    }
    return `${Number(value).toFixed(1)}s`;
}

function asNameList(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function buildDataerAlertDetail(body) {
    const result = asDisplayText(body?.result, 256);
    const host = asDisplayText(body?.host, 256);
    const remote = asDisplayText(body?.remote, 256);
    const local = asDisplayText(body?.local, 256);
    const finishedAt = asDisplayText(body?.finishedAt, 64);
    return [
        `Result: ${result}`,
        `Host: ${host}`,
        `Remote → Local: ${remote} → ${local}`,
        `Finished: ${finishedAt}`,
        `Duration: ${formatDurationSeconds(body?.durationSeconds)}`,
    ].join("\n");
}

function buildDberAlertDetail(body) {
    const result = asDisplayText(body?.result, 256);
    const fromHost = asDisplayText(body?.fromHost, 256);
    const toHost = body?.importToTarget === false ? "—" : asDisplayText(body?.toHost, 256);
    const eventNames = [
        ...new Set([...asNameList(body?.failedDatabases), ...asNameList(body?.succeededDatabases)]),
    ];
    const databases =
        eventNames.length > 0
            ? eventNames.join(", ")
            : asNameList(body?.databases).join(", ") || "—";
    const finishedAt = asDisplayText(body?.finishedAt, 64);
    const lines = [
        `Result: ${result}`,
        `From → To: ${fromHost} → ${toHost}`,
        `Databases: ${databases}`,
        `Finished: ${finishedAt}`,
        `Duration: ${formatDurationSeconds(body?.durationSeconds)}`,
    ];
    const bacpacPath = String(body?.bacpacPath || "").trim();
    if (bacpacPath) {
        lines.push(`Bacpac: ${asDisplayText(bacpacPath, 256)}`);
    }
    return lines.join("\n");
}

const JOB_ALERT_PENDING_MAX = 50;

function shouldSkipSuccessAlert({ skipSuccessAlerts, body }) {
    if (!skipSuccessAlerts) {
        return false;
    }
    const status = resolveServiceRunStatus({
        success: body?.success,
        result: body?.result,
        successCount: body?.successCount,
        failedCount: body?.failedCount,
        succeededDatabases: body?.succeededDatabases,
        failedDatabases: body?.failedDatabases,
    });
    return status === "success";
}

function asPendingList(value) {
    return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : [];
}

function appendPendingEntry(list, entry) {
    const next = [...asPendingList(list), entry];
    while (next.length > JOB_ALERT_PENDING_MAX) {
        next.shift();
    }
    return next;
}

function combineJobAlertDetail(pending) {
    const entries = asPendingList(pending);
    if (entries.length === 0) {
        return "";
    }
    if (entries.length === 1) {
        return String(entries[0].detail || "").trim();
    }
    return entries
        .map((entry, index) => {
            const finishedAt = asDisplayText(entry.finishedAt, 64);
            const header = finishedAt !== "—" ? `── ${index + 1} · ${finishedAt} ──` : `── ${index + 1} ──`;
            return `${header}\n${String(entry.detail || "").trim()}`;
        })
        .join("\n\n");
}

async function saveAlertStatePatch(serverId, currentState, patch) {
    const next = { ...parseAlertState(currentState), ...patch };
    await updateServerAlertStateById({ id: serverId, alert_state: next });
    return next;
}

async function deliverDataerDigest({ server, recipients, pending }) {
    const entries = asPendingList(pending);
    if (!entries.length) {
        return false;
    }
    const detail = combineJobAlertDetail(entries);
    const detailOneLine = asDisplayText(detail.replace(/\n/g, " · "), 512);
    const latest = entries[entries.length - 1] || {};
    const finishedAt = asDisplayText(latest.finishedAt, 64);
    const result = asDisplayText(latest.result, 160);
    const count = entries.length;
    const subject =
        count > 1 ? `Dataer sync — ${server.name} (${count})` : `Dataer sync — ${server.name}`;
    const alertTitle = count > 1 ? `Dataer path sync (${count} results)` : "Dataer path sync";
    const smsMessage =
        count > 1
            ? `HammerByte: ${server.name} Dataer · ${count} results · latest: ${result}`
            : `HammerByte: ${server.name} Dataer · ${asDisplayText(latest.remote, 80)} → ${asDisplayText(latest.local, 80)} · ${result}`;
    const delivery = notifySection({
        server,
        recipients,
        subject,
        htmlBuilder: (recipientName) =>
            metricEmailHtml({
                recipientName,
                server,
                alertTitle,
                alertDetail: escapeAlertDetailHtml(detail),
                capturedAt: finishedAt,
            }),
        smsMessage,
    });
    return logDeliveredAlert({
        server,
        kind: "dataer_result",
        detail: detailOneLine,
        delivery,
    });
}

async function deliverDberDigest({ server, recipients, pending }) {
    const entries = asPendingList(pending);
    if (!entries.length) {
        return false;
    }
    const detail = combineJobAlertDetail(entries);
    const detailOneLine = asDisplayText(detail.replace(/\n/g, " · "), 512);
    const latest = entries[entries.length - 1] || {};
    const finishedAt = asDisplayText(latest.finishedAt, 64);
    const result = asDisplayText(latest.result, 160);
    const count = entries.length;
    const subject =
        count > 1 ? `DBer sync — ${server.name} (${count})` : `DBer sync — ${server.name}`;
    const alertTitle = count > 1 ? `DBer database sync (${count} results)` : "DBer database sync";
    const smsMessage =
        count > 1
            ? `HammerByte: ${server.name} DBer · ${count} results · latest: ${result}`
            : `HammerByte: ${server.name} DBer · ${asDisplayText(latest.fromHost, 80)} → ${asDisplayText(latest.toHost, 80)} · ${result}`;
    const delivery = notifySection({
        server,
        recipients,
        subject,
        htmlBuilder: (recipientName) =>
            metricEmailHtml({
                recipientName,
                server,
                alertTitle,
                alertDetail: escapeAlertDetailHtml(detail),
                capturedAt: finishedAt,
            }),
        smsMessage,
    });
    return logDeliveredAlert({
        server,
        kind: "dber_result",
        detail: detailOneLine,
        delivery,
    });
}

/**
 * Flush buffered Dataer results once cooloff has elapsed (ingest or watcher).
 */
export async function flushPendingDataerAlerts({ server }) {
    try {
        if (!server?.id) {
            return;
        }
        const config = parseAlertConfig(server.alert_config);
        const dataer = config.dataer;
        if (!dataer.enabled || !dataer.recipients.length || !dataer.recipients.some(recipientCanNotify)) {
            return;
        }
        const state = parseAlertState(server.alert_state);
        const pending = asPendingList(state.dataer_pending);
        if (!pending.length) {
            return;
        }
        if (!cooldownElapsed(state.dataer_result, dataer.cooldown_seconds)) {
            return;
        }
        if (!(await deliverDataerDigest({ server, recipients: dataer.recipients, pending }))) {
            logger.info(`server #${server.id} dataer digest not delivered (no mediums)`);
            return;
        }
        await saveAlertStatePatch(server.id, server.alert_state, {
            dataer_pending: [],
            dataer_result: stampNow(),
        });
        logger.info(`server #${server.id} dataer digest sent (${pending.length})`);
    } catch (error) {
        logger.error(`flushPendingDataerAlerts: ${error}`);
    }
}

/**
 * Flush buffered DBer results once cooloff has elapsed (ingest or watcher).
 */
export async function flushPendingDberAlerts({ server }) {
    try {
        if (!server?.id) {
            return;
        }
        const config = parseAlertConfig(server.alert_config);
        const dber = config.dber;
        if (!dber.enabled || !dber.recipients.length || !dber.recipients.some(recipientCanNotify)) {
            return;
        }
        const state = parseAlertState(server.alert_state);
        const pending = asPendingList(state.dber_pending);
        if (!pending.length) {
            return;
        }
        if (!cooldownElapsed(state.dber_result, dber.cooldown_seconds)) {
            return;
        }
        if (!(await deliverDberDigest({ server, recipients: dber.recipients, pending }))) {
            logger.info(`server #${server.id} dber digest not delivered (no mediums)`);
            return;
        }
        await saveAlertStatePatch(server.id, server.alert_state, {
            dber_pending: [],
            dber_result: stampNow(),
        });
        logger.info(`server #${server.id} dber digest sent (${pending.length})`);
    } catch (error) {
        logger.error(`flushPendingDberAlerts: ${error}`);
    }
}

/**
 * Queue Dataer results during cooloff; send one combined alert when cooloff allows.
 */
export async function evaluateDataerAlerts({ server, body }) {
    try {
        if (!server?.id || !body || typeof body !== "object") {
            return;
        }

        const config = parseAlertConfig(server.alert_config);
        const dataer = config.dataer;
        if (!dataer.enabled) {
            logger.info(`server #${server.id} dataer alerts skipped: disabled`);
            return;
        }
        if (!dataer.recipients.length) {
            logger.info(`server #${server.id} dataer alerts skipped: no recipients`);
            return;
        }
        if (!dataer.recipients.some(recipientCanNotify)) {
            logger.info(`server #${server.id} dataer alerts skipped: no email/SMS enabled`);
            return;
        }
        if (
            shouldSkipSuccessAlert({
                skipSuccessAlerts: dataer.skip_success_alerts,
                body,
            })
        ) {
            logger.info(`server #${server.id} dataer alerts skipped: success only`);
            return;
        }

        const entry = {
            detail: buildDataerAlertDetail(body),
            finishedAt: asDisplayText(body.finishedAt, 64),
            result: asDisplayText(body.result, 160),
            remote: asDisplayText(body.remote, 120),
            local: asDisplayText(body.local, 120),
        };

        const fresh = (await getServerById({ id: server.id })) || server;
        const state = parseAlertState(fresh.alert_state);
        const pending = appendPendingEntry(state.dataer_pending, entry);
        const section = parseAlertConfig(fresh.alert_config).dataer;

        if (!cooldownElapsed(state.dataer_result, section.cooldown_seconds)) {
            await saveAlertStatePatch(fresh.id, fresh.alert_state, { dataer_pending: pending });
            logger.info(
                `server #${server.id} dataer alert buffered (${pending.length}, cooloff ${section.cooldown_seconds}s)`,
            );
            return;
        }

        if (
            !(await deliverDataerDigest({
                server: fresh,
                recipients: section.recipients,
                pending,
            }))
        ) {
            await saveAlertStatePatch(fresh.id, fresh.alert_state, { dataer_pending: pending });
            logger.info(`server #${server.id} dataer alert not delivered (no mediums)`);
            return;
        }

        await saveAlertStatePatch(fresh.id, fresh.alert_state, {
            dataer_pending: [],
            dataer_result: stampNow(),
        });
        logger.info(`server #${server.id} dataer digest sent (${pending.length})`);
    } catch (error) {
        logger.error(`evaluateDataerAlerts: ${error}`);
    }
}

/**
 * Queue DBer results during cooloff; send one combined alert when cooloff allows.
 */
export async function evaluateDberAlerts({ server, body }) {
    try {
        if (!server?.id || !body || typeof body !== "object") {
            return;
        }

        const config = parseAlertConfig(server.alert_config);
        const dber = config.dber;
        if (!dber.enabled) {
            logger.info(`server #${server.id} dber alerts skipped: disabled`);
            return;
        }
        if (!dber.recipients.length) {
            logger.info(`server #${server.id} dber alerts skipped: no recipients`);
            return;
        }
        if (!dber.recipients.some(recipientCanNotify)) {
            logger.info(`server #${server.id} dber alerts skipped: no email/SMS enabled`);
            return;
        }
        if (
            shouldSkipSuccessAlert({
                skipSuccessAlerts: dber.skip_success_alerts,
                body,
            })
        ) {
            logger.info(`server #${server.id} dber alerts skipped: success only`);
            return;
        }

        const entry = {
            detail: buildDberAlertDetail(body),
            finishedAt: asDisplayText(body.finishedAt, 64),
            result: asDisplayText(body.result, 160),
            fromHost: asDisplayText(body.fromHost, 80),
            toHost: body?.importToTarget === false ? "—" : asDisplayText(body.toHost, 80),
        };

        const fresh = (await getServerById({ id: server.id })) || server;
        const state = parseAlertState(fresh.alert_state);
        const pending = appendPendingEntry(state.dber_pending, entry);
        const section = parseAlertConfig(fresh.alert_config).dber;

        if (!cooldownElapsed(state.dber_result, section.cooldown_seconds)) {
            await saveAlertStatePatch(fresh.id, fresh.alert_state, { dber_pending: pending });
            logger.info(
                `server #${server.id} dber alert buffered (${pending.length}, cooloff ${section.cooldown_seconds}s)`,
            );
            return;
        }

        if (
            !(await deliverDberDigest({
                server: fresh,
                recipients: section.recipients,
                pending,
            }))
        ) {
            await saveAlertStatePatch(fresh.id, fresh.alert_state, { dber_pending: pending });
            logger.info(`server #${server.id} dber alert not delivered (no mediums)`);
            return;
        }

        await saveAlertStatePatch(fresh.id, fresh.alert_state, {
            dber_pending: [],
            dber_result: stampNow(),
        });
        logger.info(`server #${server.id} dber digest sent (${pending.length})`);
    } catch (error) {
        logger.error(`evaluateDberAlerts: ${error}`);
    }
}

export async function evaluatePingerMissedAlert({
    server,
    secondsSincePing,
    lastPingAt,
}) {
    try {
        if (!server?.id) {
            return;
        }
        const config = parseAlertConfig(server.alert_config);
        const pinger = config.pinger;
        if (!pinger.enabled || !pinger.recipients.length) {
            return;
        }
        if (secondsSincePing == null || !Number.isFinite(secondsSincePing)) {
            return;
        }
        if (secondsSincePing < pinger.missed_ping_seconds) {
            return;
        }
        const state = parseAlertState(server.alert_state);
        if (!cooldownElapsed(state.pinger_missed, pinger.cooldown_seconds)) {
            return;
        }

        const htmlFor = (recipientName) =>
            filer.prepareTemplated("templates/server_ping_missed_alert.html", {
                recipient_name: recipientName,
                server_name: server.name || "—",
                server_location: server.location || "—",
                missed_ping_seconds: String(pinger.missed_ping_seconds),
                seconds_since_ping: String(Math.round(secondsSincePing)),
                last_ping_at: lastPingAt || "never",
                server_url: serverUrl(server.id),
                app_name: "HammerByte",
            });

        const detail = `No ping for ${Math.round(secondsSincePing)}s (limit ${pinger.missed_ping_seconds}s)`;
        const delivery = notifySection({
            server,
            recipients: pinger.recipients,
            subject: `Server ping missed — ${server.name}`,
            htmlBuilder: htmlFor,
            smsMessage: `HammerByte: ${server.name} no ping for ${Math.round(secondsSincePing)}s (limit ${pinger.missed_ping_seconds}s)`,
        });

        if (
            !(await logDeliveredAlert({
                server,
                kind: "pinger_missed",
                detail,
                delivery,
            }))
        ) {
            logger.info(`server #${server.id} pinger missed alert not delivered (no mediums)`);
            return;
        }

        // Prefer fresh row stamp; fall back to passed server state.
        const fresh = (await getServerById({ id: server.id })) || server;
        await stampAlertState(fresh.id, fresh.alert_state, "pinger_missed");
        logger.info(
            `server #${server.id} pinger missed alert sent (${Math.round(secondsSincePing)}s)`,
        );
    } catch (error) {
        logger.error(`evaluatePingerMissedAlert: ${error}`);
    }
}
