import { filer, logger } from "@hammerbyte/utils";
import transporter from "./transporter.js";
import { getUserById, getAllSuperAdminUsers } from "../db/users.js";
import {
    getLinkedinGrowRunById,
    getLinkedinGrowRunAccountsByRunId,
    getLinkedinGrowRunDesignationsByRunId,
} from "../db/linkedin_grow_runs.js";
import {
    getLinkedinSearchRunById,
    getLinkedinSearchRunAccountsByRunId,
    getLinkedinSearchRunDesignationsByRunId,
} from "../db/linkedin_search_runs.js";
import {
    getLinkedinMessageRunById,
    getLinkedinMessageRunAccountsByRunId,
    getLinkedinMessageRunDesignationsByRunId,
} from "../db/linkedin_message_runs.js";
import { getReadableDate } from "./date.js";

function formatDateTime(value) {
    if (!value) {
        return "—";
    }
    return getReadableDate("DD/MM/YYYY HH:mm:ss", value) || String(value);
}

function buildAccountsText(accounts) {
    if (!accounts?.length) {
        return "—";
    }
    return accounts
        .map(
            (account) =>
                `${account.user_name}: ${account.sent_count} sent (${account.status})`,
        )
        .join("\n");
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

    const superAdminUsers = await getAllSuperAdminUsers();
    recipients.push(...superAdminUsers);

    return uniqueRecipients(recipients);
}

function sendRunCompleteEmail({
    recipients,
    networkName,
    run,
    accounts,
    designations,
    configLabel,
    configValue,
    triggeredBy,
}) {
    const totalSent = (accounts || []).reduce(
        (sum, account) => sum + Number(account.sent_count || 0),
        0,
    );
    const designationNames = (designations || [])
        .map((designation) => designation.designation_name)
        .filter(Boolean)
        .join(", ");

    const html = filer.prepareTemplated("templates/linkedin_run_complete.html", {
        network_name: networkName,
        status: run.status || "unknown",
        run_id: run.id,
        triggered_by: triggeredBy,
        started_on: formatDateTime(run.started_on),
        finished_on: formatDateTime(run.finished_on),
        config_label: configLabel,
        config_value: configValue,
        designations: designationNames || "—",
        total_sent: totalSent,
        accounts_text: buildAccountsText(accounts),
        error_block: run.error_message
            ? `Error: ${run.error_message}`
            : "",
        app_name: "HammerByte",
    });

    for (const recipient of recipients) {
        transporter.transport({
            recipient,
            subject: `LinkedIn ${networkName} ${run.status} — run #${run.id}`,
            body: html,
            html_enabled: true,
        });
        logger.info(`linkedin run email queued for ${recipient} (run #${run.id})`);
    }
}

export async function notifyLinkedinGrowRunComplete({ runId }) {
    try {
        const run = await getLinkedinGrowRunById({ id: runId });
        if (!run) {
            return;
        }

        const accounts = await getLinkedinGrowRunAccountsByRunId({ run_id: runId });
        const designations = await getLinkedinGrowRunDesignationsByRunId({ run_id: runId });
        const createdByUser = run.created_by
            ? await getUserById({ id: run.created_by })
            : null;
        const recipients = await resolveRecipients({ created_by: run.created_by });

        if (!recipients.length) {
            logger.info(`linkedin grow run #${runId} finished with no email recipients`);
            return;
        }

        sendRunCompleteEmail({
            recipients,
            networkName: "GrowNetwork",
            run,
            accounts,
            designations,
            configLabel: "Per-account limit",
            configValue: run.per_account_limit,
            triggeredBy: createdByUser
                ? `${createdByUser.full_name || "User"} <${createdByUser.email}>`
                : "Unknown",
        });
    } catch (error) {
        logger.error(`notifyLinkedinGrowRunComplete: ${error}`);
    }
}

export async function notifyLinkedinSearchRunComplete({ runId }) {
    try {
        const run = await getLinkedinSearchRunById({ id: runId });
        if (!run) {
            return;
        }

        const accounts = await getLinkedinSearchRunAccountsByRunId({ run_id: runId });
        const designations = await getLinkedinSearchRunDesignationsByRunId({ run_id: runId });
        const createdByUser = run.created_by
            ? await getUserById({ id: run.created_by })
            : null;
        const recipients = await resolveRecipients({ created_by: run.created_by });

        if (!recipients.length) {
            logger.info(`linkedin search run #${runId} finished with no email recipients`);
            return;
        }

        sendRunCompleteEmail({
            recipients,
            networkName: "SearchNetwork",
            run,
            accounts,
            designations,
            configLabel: "Pages",
            configValue: run.page_count,
            triggeredBy: createdByUser
                ? `${createdByUser.full_name || "User"} <${createdByUser.email}>`
                : "Unknown",
        });
    } catch (error) {
        logger.error(`notifyLinkedinSearchRunComplete: ${error}`);
    }
}

export async function notifyLinkedinMessageRunComplete({ runId }) {
    try {
        const run = await getLinkedinMessageRunById({ id: runId });
        if (!run) {
            return;
        }

        const accounts = await getLinkedinMessageRunAccountsByRunId({ run_id: runId });
        const designations = await getLinkedinMessageRunDesignationsByRunId({ run_id: runId });
        const createdByUser = run.created_by
            ? await getUserById({ id: run.created_by })
            : null;
        const recipients = await resolveRecipients({ created_by: run.created_by });

        if (!recipients.length) {
            logger.info(`linkedin message run #${runId} finished with no email recipients`);
            return;
        }

        sendRunCompleteEmail({
            recipients,
            networkName: "MessageNetwork",
            run,
            accounts,
            designations,
            configLabel: "Per-account limit",
            configValue: run.per_account_limit,
            triggeredBy: createdByUser
                ? `${createdByUser.full_name || "User"} <${createdByUser.email}>`
                : "Unknown",
        });
    } catch (error) {
        logger.error(`notifyLinkedinMessageRunComplete: ${error}`);
    }
}
