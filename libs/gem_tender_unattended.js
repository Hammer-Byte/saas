import { logger } from "@hammerbyte/utils";
import { GEM_TENDER_LOCK_MESSAGES } from "../constants.js";
import {
    markPastAssignedGemKeywordTendersLocked,
    markPastNewUnassignedGemKeywordTendersLocked,
} from "../db/gem_keyword_tenders.js";
import { getIstDateTime } from "./date.js";

// One cycle every hour: lock past-due new/unassigned and assigned pipeline tenders.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function runUnattendedCycle() {
    const asOf = getIstDateTime();
    try {
        const dueDatePassed = await markPastNewUnassignedGemKeywordTendersLocked({
            as_of_datetime: asOf,
            lock_message: GEM_TENDER_LOCK_MESSAGES.DUE_DATE_PASSED,
        });
        const deadlineMissed = await markPastAssignedGemKeywordTendersLocked({
            as_of_datetime: asOf,
            lock_message: GEM_TENDER_LOCK_MESSAGES.DEADLINE_MISSED,
        });
        if (dueDatePassed || deadlineMissed) {
            logger.info(
                `gem tender lock watcher: due_date_passed=${dueDatePassed} deadline_missed=${deadlineMissed}`,
            );
        }
    } catch (error) {
        logger.error(`gem tender lock watcher cycle: ${error}`);
    }
}

export async function checkGemTenderUnattended() {
    await runUnattendedCycle();
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
