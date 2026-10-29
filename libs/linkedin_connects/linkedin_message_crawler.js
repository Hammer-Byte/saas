import { logger } from "@hammerbyte/utils";
import {
    LinkedinMessagePage,
    matchDesignationPool,
    pickRandomMessage,
} from "./linkedin_message_pom.js";
import { updateLinkedinMessageRunAccountById } from "../../db/linkedin_message_runs.js";

const MAX_SCROLLS = 20;
const SCROLL_WAIT_MS = 2000;
const DELAY_MS = 2500;

async function collectConnectionCards(driver, maxNeeded) {
    const byKey = new Map();

    for (let pass = 0; pass <= MAX_SCROLLS; pass++) {
        const cards = await LinkedinMessagePage.readCards(driver);
        for (const card of cards) {
            const key = card.composeUrl || card.profileUrl || card.messageAriaLabel;
            if (!key || byKey.has(key)) {
                continue;
            }
            byKey.set(key, card);
        }

        if (byKey.size >= maxNeeded) {
            break;
        }
        if (pass === MAX_SCROLLS) {
            break;
        }

        const before = byKey.size;
        await LinkedinMessagePage.scrollConnections(driver);
        await LinkedinMessagePage.sleep(SCROLL_WAIT_MS);
        if (byKey.size === before) {
            // one more read after scroll settling
            const more = await LinkedinMessagePage.readCards(driver);
            for (const card of more) {
                const key = card.composeUrl || card.profileUrl || card.messageAriaLabel;
                if (key && !byKey.has(key)) {
                    byKey.set(key, card);
                }
            }
            if (byKey.size === before) {
                break;
            }
        }
    }

    return [...byKey.values()];
}

export async function messageNewConnections({
    driver,
    designationPools,
    maxMessagesPerAccount,
    runAccountId,
}) {
    await LinkedinMessagePage.open(driver);
    const cardsReady = await LinkedinMessagePage.waitForCards(driver);
    await LinkedinMessagePage.sleep(1000);

    if (!cardsReady) {
        const diagnosis = await LinkedinMessagePage.diagnose(driver);
        logger.info(`linkedin message page diagnose: ${JSON.stringify(diagnosis)}`);
        logger.info(`linkedin message no connection cards at ${await driver.getCurrentUrl()}`);
        await updateLinkedinMessageRunAccountById({
            id: runAccountId,
            sent_count: 0,
            status: "completed",
        });
        return { sent: 0, status: "completed" };
    }

    // Collect more cards than the send limit so designation/new filters still have room.
    const harvestTarget = Math.max(maxMessagesPerAccount * 8, 40);
    const cards = await collectConnectionCards(driver, harvestTarget);
    logger.info(`linkedin message harvested ${cards.length} connection card(s)`);

    let sent = 0;
    const accountStatus = "completed";

    for (const card of cards) {
        if (sent >= maxMessagesPerAccount) {
            break;
        }

        const personLabel = card.name || card.headline || "unknown";
        if (!card.composeUrl) {
            logger.info(`linkedin message skip ${personLabel} — missing compose url`);
            continue;
        }

        const opened = await LinkedinMessagePage.openComposeUrl(driver, card.composeUrl);
        if (!opened) {
            logger.info(`linkedin message skip ${personLabel} — could not open compose`);
            continue;
        }

        const dialogReady = await LinkedinMessagePage.waitForMessageDialog(driver);
        if (!dialogReady) {
            logger.info(`linkedin message skip ${personLabel} — compose box did not appear`);
            await LinkedinMessagePage.closeDialog(driver);
            await LinkedinMessagePage.waitForCards(driver);
            continue;
        }

        await LinkedinMessagePage.sleep(500);
        const dialog = await LinkedinMessagePage.inspectOpenDialog(driver);

        if (!dialog?.isNew) {
            logger.info(
                `linkedin message skip ${personLabel} — existing conversation (events=${dialog?.eventCount ?? "?"})`,
            );
            await LinkedinMessagePage.closeDialog(driver);
            await LinkedinMessagePage.waitForCards(driver);
            continue;
        }

        const headline = card.headline || "";
        const pool = matchDesignationPool(headline, designationPools);
        if (!pool) {
            logger.info(
                `linkedin message skip ${personLabel} — no designation includes match for "${headline}"`,
            );
            await LinkedinMessagePage.closeDialog(driver);
            await LinkedinMessagePage.waitForCards(driver);
            continue;
        }

        const message = pickRandomMessage(pool.messages);
        if (!message) {
            await LinkedinMessagePage.closeDialog(driver);
            await LinkedinMessagePage.waitForCards(driver);
            continue;
        }

        const result = await LinkedinMessagePage.typeAndSend(driver, message);
        await LinkedinMessagePage.closeDialog(driver);
        await LinkedinMessagePage.waitForCards(driver);

        if (result !== "sent") {
            logger.info(`linkedin message skip ${personLabel} — send failed (${result})`);
            continue;
        }

        sent += 1;
        logger.info(
            `linkedin message sent ${personLabel} — ${pool.name} (${sent}/${maxMessagesPerAccount})`,
        );
        await updateLinkedinMessageRunAccountById({
            id: runAccountId,
            sent_count: sent,
            status: "running",
        });
        await LinkedinMessagePage.sleep(DELAY_MS);
    }

    await updateLinkedinMessageRunAccountById({
        id: runAccountId,
        sent_count: sent,
        status: accountStatus,
    });

    return { sent, status: accountStatus };
}
