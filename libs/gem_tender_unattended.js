import { logger } from "@hammerbyte/utils";
import { GEM_TENDER_LOCK_MESSAGES } from "../constants.js";
import { markMissedGemTenders, markUnattendedGemTenders } from "../db/gem_tenders.js";
import { getIstDateTime } from "./date.js";

// One cycle every hour: flag + lock past-due tenders as missed (assigned) or unattended (unassigned).
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function runUnattendedCycle() {
    const asOf = getIstDateTime();
    try {
        const missed = await markMissedGemTenders({
            as_of_datetime: asOf,
            lock_message: GEM_TENDER_LOCK_MESSAGES.DEADLINE_MISSED,
        });
        const unattended = await markUnattendedGemTenders({
            as_of_datetime: asOf,
            lock_message: GEM_TENDER_LOCK_MESSAGES.DUE_DATE_PASSED,
        });
        if (missed || unattended) {
            logger.info(`gem tender lock watcher: missed=${missed} unattended=${unattended}`);
        }
    } catch (error) {
        logger.error(`gem tender lock watcher cycle: ${error}`);
    }
}

export function startGemTenderUnattendedWatcher() {
    runUnattendedCycle().catch((error) => {
        logger.error(`startGemTenderUnattendedWatcher initial: ${error}`);
    });
    setInterval(() => {
        runUnattendedCycle().catch((error) => {
            logger.error(`startGemTenderUnattendedWatcher tick: ${error}`);
        });
    }, CHECK_INTERVAL_MS);
}
