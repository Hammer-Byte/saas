import { filer, logger } from "@hammerbyte/utils";
import {
    getServerById,
    updateServerAlertStateById,
} from "../db/servers.js";
import {
    cooldownElapsed,
    maxTemperatureCelsius,
    memoryUsagePercent,
    parseAlertConfig,
    parseAlertState,
    storageOverThreshold,
} from "./server_alerts.js";
import transporter from "./transporter.js";

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

function notifySection({ server, recipients, subject, htmlBuilder, smsMessage }) {
    const list = Array.isArray(recipients) ? recipients : [];
    for (const recipient of list) {
        const name = recipient.name || "there";
        if (recipient.email_on && recipient.email) {
            transporter.transport({
                recipient: recipient.email,
                subject,
                body: htmlBuilder(name),
                html_enabled: true,
            });
        }
        if (recipient.sms_on && recipient.phone) {
            sendSmsStub({ phone: recipient.phone, message: smsMessage });
        }
    }
}

export async function evaluateMetricerAlerts({ server, payload }) {
    try {
        if (!server?.id || !payload || typeof payload !== "object") {
            return;
        }
        const config = parseAlertConfig(server.alert_config);
        const metricer = config.metricer;
        if (!metricer.enabled) {
            return;
        }
        if (!metricer.recipients.length) {
            return;
        }

        let state = parseAlertState(server.alert_state);
        const capturedAt = payload.capturedAt || payload.timestamp || "—";
        const cooldown = metricer.cooldown_seconds;

        if (metricer.ram_enabled) {
            const ramPct = memoryUsagePercent(payload);
            if (
                ramPct != null &&
                ramPct >= metricer.ram_percent &&
                cooldownElapsed(state.metricer_ram, cooldown)
            ) {
                const detail = `RAM usage ${ramPct.toFixed(1)}% (threshold ${metricer.ram_percent}%)`;
                notifySection({
                    server,
                    recipients: metricer.recipients,
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
                state = await stampAlertState(server.id, state, "metricer_ram");
                logger.info(`server #${server.id} metricer RAM alert sent (${detail})`);
            }
        }

        if (metricer.storage_enabled) {
            const offenders = storageOverThreshold(payload, metricer.storage_percent);
            if (offenders.length && cooldownElapsed(state.metricer_storage, cooldown)) {
                const detail = offenders
                    .map(
                        (disk) =>
                            `${disk.name}${disk.label ? ` (${disk.label})` : ""} ${disk.used_percent}% used`,
                    )
                    .join("; ");
                notifySection({
                    server,
                    recipients: metricer.recipients,
                    subject: `Server storage alert — ${server.name}`,
                    htmlBuilder: (recipientName) =>
                        metricEmailHtml({
                            recipientName,
                            server,
                            alertTitle: "Storage",
                            alertDetail: `${detail} (threshold ${metricer.storage_percent}%)`,
                            capturedAt,
                        }),
                    smsMessage: `HammerByte: ${server.name} storage over ${metricer.storage_percent}%`,
                });
                state = await stampAlertState(server.id, state, "metricer_storage");
                logger.info(`server #${server.id} metricer storage alert sent (${detail})`);
            }
        }

        if (metricer.temp_enabled) {
            const temp = maxTemperatureCelsius(payload);
            if (
                temp != null &&
                temp >= metricer.temp_celsius &&
                cooldownElapsed(state.metricer_temp, cooldown)
            ) {
                const detail = `Temperature ${temp.toFixed(1)}°C (threshold ${metricer.temp_celsius}°C)`;
                notifySection({
                    server,
                    recipients: metricer.recipients,
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
                await stampAlertState(server.id, state, "metricer_temp");
                logger.info(`server #${server.id} metricer temp alert sent (${detail})`);
            }
        }
    } catch (error) {
        logger.error(`evaluateMetricerAlerts: ${error}`);
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

        notifySection({
            server,
            recipients: pinger.recipients,
            subject: `Server ping missed — ${server.name}`,
            htmlBuilder: htmlFor,
            smsMessage: `HammerByte: ${server.name} no ping for ${Math.round(secondsSincePing)}s (limit ${pinger.missed_ping_seconds}s)`,
        });

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
