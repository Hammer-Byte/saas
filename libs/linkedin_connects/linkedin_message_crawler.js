import { logger } from "@hammerbyte/utils";
import {
    LinkedinMessagePage,
    matchDesignationPool,
    pickRandomMessage,
} from "./linkedin_message_pom.js";
import { updateLinkedinMessageRunAccountById } from "../../db/linkedin_message_runs.js";

const MAX_SCROLLS = 20;
const SCROLL_WAIT_MS = 2500;
const DELAY_MS = 2500;

export async function messageNewConnections({
    driver,
    designationPools,
    maxMessagesPerAccount,
    runAccountId,
}) {
    await LinkedinMessagePage.open(driver);
    await LinkedinMessagePage.waitForCards(driver);
    await LinkedinMessagePage.sleep(1000);

    const seen = new Set();
    let sent = 0;
    let accountStatus = "completed";

    for (let pass = 0; pass <= MAX_SCROLLS && sent < maxMessagesPerAccount; pass++) {
        let foundNewCard = false;

        while (sent < maxMessagesPerAccount) {
            const cards = await LinkedinMessagePage.readCards(driver);
            const next = cards.find((card) => {
                const key = card.profileUrl || `${card.name}|${card.headline}`;
                return key && !seen.has(key);
            });
            if (!next) {
                break;
            }

            const key = next.profileUrl || `${next.name}|${next.headline}`;
            seen.add(key);
            foundNewCard = true;

            const opened = await LinkedinMessagePage.openMessageForProfile(
                driver,
                next.profileUrl,
                next.name,
            );
            if (!opened) {
                logger.info(`linkedin message skip ${next.name || "unknown"} — Message button missing`);
                continue;
            }

            const dialogReady = await LinkedinMessagePage.waitForMessageDialog(driver);
            if (!dialogReady) {
                logger.info(`linkedin message skip ${next.name || "unknown"} — dialog did not open`);
                continue;
            }

            await LinkedinMessagePage.sleep(700);
            const dialog = await LinkedinMessagePage.inspectOpenDialog(driver);

            if (!dialog?.isNew) {
                logger.info(
                    `linkedin message skip ${next.name || "unknown"} — existing conversation (${dialog?.title || "thread"})`,
                );
                await LinkedinMessagePage.closeDialog(driver);
                continue;
            }

            const headline = next.headline || dialog.headline || "";
            const pool = matchDesignationPool(headline, designationPools);
            if (!pool) {
                logger.info(
                    `linkedin message skip ${next.name || "unknown"} — no designation includes match for "${headline}"`,
                );
                await LinkedinMessagePage.closeDialog(driver);
                continue;
            }

            const message = pickRandomMessage(pool.messages);
            if (!message) {
                await LinkedinMessagePage.closeDialog(driver);
                continue;
            }

            const result = await LinkedinMessagePage.typeAndSend(driver, message);
            await LinkedinMessagePage.sleep(800);
            await LinkedinMessagePage.closeDialog(driver);

            if (result !== "sent") {
                logger.info(
                    `linkedin message skip ${next.name || "unknown"} — send failed (${result})`,
                );
                continue;
            }

            sent += 1;
            logger.info(
                `linkedin message sent ${next.name || "unknown"} — ${pool.name} (${sent}/${maxMessagesPerAccount})`,
            );
            await updateLinkedinMessageRunAccountById({
                id: runAccountId,
                sent_count: sent,
                status: "running",
            });
            await LinkedinMessagePage.sleep(DELAY_MS);
        }

        if (!foundNewCard && seen.size === 0 && pass === 0) {
            logger.info(`linkedin message no connection cards at ${await driver.getCurrentUrl()}`);
            break;
        }

        if (pass === MAX_SCROLLS || sent >= maxMessagesPerAccount) {
            break;
        }

        logger.info(
            `linkedin message scroll ${pass + 1}/${MAX_SCROLLS} — waiting ${SCROLL_WAIT_MS / 1000}s`,
        );
        await LinkedinMessagePage.scrollConnections(driver);
        await LinkedinMessagePage.sleep(SCROLL_WAIT_MS);
    }

    await updateLinkedinMessageRunAccountById({
        id: runAccountId,
        sent_count: sent,
        status: accountStatus,
    });

    return { sent, status: accountStatus };
}
