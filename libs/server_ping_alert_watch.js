import { logger } from "@hammerbyte/utils";
import { getActiveServersForPingAlerts } from "../db/servers.js";
import { getLatestServerPingByServerId } from "../db/server_pings.js";
import { parseAlertConfig, parseAlertState } from "./server_alerts.js";
import {
    evaluatePingerMissedAlert,
    flushPendingDataerAlerts,
    flushPendingDberAlerts,
} from "./server_alert_notify.js";

const CHECK_INTERVAL_MS = 30 * 1000;

export async function checkServerPingAlerts() {
    try {
        const servers = await getActiveServersForPingAlerts();
        for (const server of servers) {
            const config = parseAlertConfig(server.alert_config);
            if (!config.pinger.enabled) {
                continue;
            }
            const latestPing = await getLatestServerPingByServerId({ server_id: server.id });
            const secondsSincePing =
                latestPing?.seconds_since_received == null
                    ? null
                    : Number(latestPing.seconds_since_received);
            // No ping ever: treat as very old so missed alert can fire after threshold from create time is not tracked;
            // use a large age so first-time machines without pings still alert once enabled.
            const age =
                secondsSincePing != null && Number.isFinite(secondsSincePing)
                    ? secondsSincePing
                    : Number.POSITIVE_INFINITY;
            await evaluatePingerMissedAlert({
                server,
                secondsSincePing: age === Number.POSITIVE_INFINITY ? config.pinger.missed_ping_seconds : age,
                lastPingAt: latestPing?.received_on || null,
            });
        }
    } catch (error) {
        logger.error(`checkServerPingAlerts: ${error}`);
    }
}

/** Flush Dataer/DBer digests buffered during cooloff once the interval has elapsed. */
export async function checkServerJobAlertDigests() {
    try {
        const servers = await getActiveServersForPingAlerts();
        for (const server of servers) {
            const config = parseAlertConfig(server.alert_config);
            const state = parseAlertState(server.alert_state);
            if (config.dataer.enabled && Array.isArray(state.dataer_pending) && state.dataer_pending.length) {
                await flushPendingDataerAlerts({ server });
            }
            if (config.dber.enabled && Array.isArray(state.dber_pending) && state.dber_pending.length) {
                await flushPendingDberAlerts({ server });
            }
        }
    } catch (error) {
        logger.error(`checkServerJobAlertDigests: ${error}`);
    }
}

export function startServerPingAlertWatcher() {
    const tick = async () => {
        await checkServerPingAlerts();
        await checkServerJobAlertDigests();
    };
    tick().catch((error) => {
        logger.error(`startServerPingAlertWatcher initial: ${error}`);
    });
    setInterval(() => {
        tick().catch((error) => {
            logger.error(`startServerPingAlertWatcher tick: ${error}`);
        });
    }, CHECK_INTERVAL_MS);
}
