import { logger } from "@hammerbyte/utils";
import {
    LinkedinMessagePage,
    matchDesignationPool,
    pickRandomMessage,
} from "./linkedin_message_pom.js";
import { updateLinkedinMessageRunAccountById } from "../../db/linkedin_message_runs.js";

const MAX_EMPTY_SCROLLS = 8;
const MAX_SCROLLS = 80;
const SCROLL_WAIT_MS = 2000;
const DELAY_MS = 2500;

function cardKey(card) {
    return card?.composeUrl || card?.profileUrl || card?.messageAriaLabel || "";
}

async function findNextUnseenCard(driver, seen) {
    const cards = await LinkedinMessagePage.readCards(driver);
    return cards.find((card) => {
        const key = cardKey(card);
        return key && !seen.has(key);
    }) || null;
}

async function returnToConnections(driver) {
    await LinkedinMessagePage.closeDialog(driver);
    await LinkedinMessagePage.waitForCards(driver);
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

    const seen = new Set();
    let sent = 0;
    let emptyScrolls = 0;
    let totalScrolls = 0;
    const accountStatus = "completed";

    logger.info(
        `linkedin message scrolling until ${maxMessagesPerAccount} send(s) (no pre-harvest batch)`,
    );

    while (sent < maxMessagesPerAccount && totalScrolls <= MAX_SCROLLS) {
        const next = await findNextUnseenCard(driver, seen);

        if (!next) {
            if (emptyScrolls >= MAX_EMPTY_SCROLLS) {
                logger.info(
                    `linkedin message stopping — no new cards after ${emptyScrolls} empty scroll(s)`,
                );
                break;
            }

            totalScrolls += 1;
            emptyScrolls += 1;
            logger.info(
                `linkedin message scroll ${totalScrolls} — looking for more cards (${sent}/${maxMessagesPerAccount} sent)`,
            );
            await LinkedinMessagePage.scrollConnections(driver);
            await LinkedinMessagePage.sleep(SCROLL_WAIT_MS);
            continue;
        }

        emptyScrolls = 0;
        const key = cardKey(next);
        seen.add(key);

        const personLabel = next.name || next.headline || "unknown";
        if (!next.composeUrl) {
            logger.info(`linkedin message skip ${personLabel} — missing compose url`);
            continue;
        }

        const opened = await LinkedinMessagePage.openComposeUrl(driver, next.composeUrl);
        if (!opened) {
            logger.info(`linkedin message skip ${personLabel} — could not open compose`);
            await returnToConnections(driver);
            continue;
        }

        const dialogReady = await LinkedinMessagePage.waitForMessageDialog(driver);
        if (!dialogReady) {
            logger.info(`linkedin message skip ${personLabel} — compose box did not appear`);
            await returnToConnections(driver);
            continue;
        }

        await LinkedinMessagePage.sleep(500);
        const dialog = await LinkedinMessagePage.inspectOpenDialog(driver);

        if (!dialog?.isNew) {
            logger.info(
                `linkedin message skip ${personLabel} — existing conversation (events=${dialog?.eventCount ?? "?"})`,
            );
            await returnToConnections(driver);
            continue;
        }

        const headline = next.headline || "";
        const pool = matchDesignationPool(headline, designationPools);
        if (!pool) {
            logger.info(
                `linkedin message skip ${personLabel} — no designation includes match for "${headline}"`,
            );
            await returnToConnections(driver);
            continue;
        }

        const message = pickRandomMessage(pool.messages);
        if (!message) {
            await returnToConnections(driver);
            continue;
        }

        const result = await LinkedinMessagePage.typeAndSend(driver, message);
        await returnToConnections(driver);

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
