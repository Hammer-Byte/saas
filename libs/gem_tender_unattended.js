import { logger } from "@hammerbyte/utils";
import {
    markPastAssignedGemKeywordTendersMissed,
    markPastNewUnassignedGemKeywordTendersUnattended,
} from "../db/gem_keyword_tenders.js";
import { getIstDateTime } from "./date.js";

// Check often, but only mark at most twice per day (~every 12 hours).
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const RUN_EVERY_MS = 12 * 60 * 60 * 1000;

let lastRunAt = 0;

export async function checkGemTenderDeadlineStages() {
    try {
        const now = Date.now();
        if (lastRunAt && now - lastRunAt < RUN_EVERY_MS) {
            return;
        }

        const asOf = getIstDateTime();
        const unattended = await markPastNewUnassignedGemKeywordTendersUnattended({
            as_of_datetime: asOf,
        });
        const missed = await markPastAssignedGemKeywordTendersMissed({
            as_of_datetime: asOf,
        });
        lastRunAt = now;

        if (unattended > 0) {
            logger.info(
                `gem tender unattended: marked ${unattended} New/unassigned tender(s) past end (${asOf})`,
            );
        } else {
            logger.info(`gem tender unattended: no tenders to mark (${asOf})`);
        }

        if (missed > 0) {
            logger.info(
                `gem tender missed: marked ${missed} assigned tender(s) past end (${asOf})`,
            );
        } else {
            logger.info(`gem tender missed: no tenders to mark (${asOf})`);
        }
    } catch (error) {
        logger.error(`checkGemTenderDeadlineStages: ${error}`);
    }
}

/** @deprecated use checkGemTenderDeadlineStages */
export async function checkGemTenderUnattended() {
    return checkGemTenderDeadlineStages();
}

export function startGemTenderUnattendedWatcher() {
    checkGemTenderDeadlineStages().catch((error) => {
        logger.error(`startGemTenderUnattendedWatcher initial: ${error}`);
    });
    setInterval(() => {
        checkGemTenderDeadlineStages().catch((error) => {
            logger.error(`startGemTenderUnattendedWatcher tick: ${error}`);
        });
    }, CHECK_INTERVAL_MS);
}
