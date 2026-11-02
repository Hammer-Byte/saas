import { filer, logger } from "@hammerbyte/utils";
import transporter from "./transporter.js";
import { getUserById, getAllSuperAdminUsers } from "../db/users.js";
import {
    getContentPublishRunById,
    getContentPublishRunTargetsByRunId,
} from "../db/content_publish_runs.js";
import { getReadableDate } from "./date.js";

function formatDateTime(value) {
    if (!value) {
        return "—";
    }
    return getReadableDate("DD/MM/YYYY HH:mm:ss", value) || String(value);
}

function uniqueRecipients(users) {
    const emails = new Set();
    const recipients = [];
    for (const user of users) {
        const email = String(user?.email || "").trim();
        if (!email || emails.has(email.toLowerCase())) {
            continue;
        }
        emails.add(email.toLowerCase());
        recipients.push(email);
    }
    return recipients;
}

async function resolveRecipients({ created_by }) {
    const recipients = [];
    if (created_by) {
        const createdByUser = await getUserById({ id: created_by });
        if (createdByUser) {
            recipients.push(createdByUser);
        }
    }
    recipients.push(...(await getAllSuperAdminUsers()));
    return uniqueRecipients(recipients);
}

export async function notifyContentPublishRunComplete({ runId }) {
    try {
        const run = await getContentPublishRunById({ id: runId });
        if (!run) {
            return;
        }

        const targets = await getContentPublishRunTargetsByRunId({ run_id: runId });
        const createdByUser = run.created_by ? await getUserById({ id: run.created_by }) : null;
        const recipients = await resolveRecipients({ created_by: run.created_by });
        if (!recipients.length) {
            logger.info(`content publish run #${runId} finished with no email recipients`);
            return;
        }

        const targetsText = targets.length
            ? targets
                  .map(
                      (target) =>
                          `${target.platform}: ${target.status}${
                              target.error_message ? ` (${target.error_message})` : ""
                          }`,
                  )
                  .join("\n")
            : "—";

        const html = filer.prepareTemplated("templates/content_publish_run_complete.html", {
            status: run.status || "unknown",
            run_id: run.id,
            user_name: run.user_name || "—",
            triggered_by: createdByUser
                ? `${createdByUser.full_name || "User"} <${createdByUser.email}>`
                : "Unknown",
            started_on: formatDateTime(run.started_on),
            finished_on: formatDateTime(run.finished_on),
            targets_text: targetsText,
            error_block: run.error_message ? `Error: ${run.error_message}` : "",
            app_name: "HammerByte",
        });

        for (const recipient of recipients) {
            transporter.transport({
                recipient,
                subject: `Content publish ${run.status} — run #${run.id}`,
                body: html,
                html_enabled: true,
            });
            logger.info(`content publish email queued for ${recipient} (run #${run.id})`);
        }
    } catch (error) {
        logger.error(`notifyContentPublishRunComplete: ${error}`);
    }
}
