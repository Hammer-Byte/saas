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
            const offenders = storageOverThreshold(payload, metricer.storage_percent);
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
