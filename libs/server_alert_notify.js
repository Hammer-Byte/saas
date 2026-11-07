import { filer, logger } from "@hammerbyte/utils";
import transporter from "./transporter.js";
import { getIstDateTime, getReadableDate } from "./date.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import { getCustomerById } from "../db/customers.js";
import { getCustomerEmailsByCustomerId } from "../db/customer_emails.js";
import { getAllSuperAdminUsers } from "../db/users.js";

const MEMORY_ALERT_THRESHOLD_PERCENT = 90;
const MEMORY_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

const lastMemoryAlertAtByServerId = new Map();

function uniqueEmails(emails) {
    const seen = new Set();
    const recipients = [];
    for (const value of emails) {
        const email = String(value || "").trim();
        if (!email || seen.has(email.toLowerCase())) {
            continue;
        }
        seen.add(email.toLowerCase());
        recipients.push(email);
    }
    return recipients;
}

function formatMegabytes(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return "—";
    }
    return `${amount.toFixed(1)} MB`;
}

function formatPercent(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return "—";
    }
    return amount.toFixed(1);
}

function publicBaseUrl() {
    return String(Bun.env.PUBLIC_BASE_URL || "https://hammerbyte.co.in").replace(/\/$/, "");
}

export async function notifyServerHighMemoryAlertIfNeeded({ server, body }) {
    try {
        if (!server?.id || !server.alert) {
            return;
        }

        if (!body || typeof body !== "object") {
            return;
        }

        if (String(body.type || "").toLowerCase() === "drive_sync") {
            return;
        }

        const memory = body.memory && typeof body.memory === "object" ? body.memory : null;
        const memoryPercent = Number(memory?.used_percent);
        if (!Number.isFinite(memoryPercent) || memoryPercent <= MEMORY_ALERT_THRESHOLD_PERCENT) {
            return;
        }

        const lastAlertAt = lastMemoryAlertAtByServerId.get(server.id) || 0;
        if (Date.now() - lastAlertAt < MEMORY_ALERT_COOLDOWN_MS) {
            return;
        }

        const recipientEmails = [];
        let projectTitle = "—";
        let customerName = "—";

        if (server.project_id) {
            const project = await getCustomerProjectById({ id: server.project_id });
            if (project) {
                projectTitle = project.title || "—";
                const customer = await getCustomerById({ id: project.customer_id });
                customerName = customer?.company || customer?.full_name || "—";
                const customerEmails = await getCustomerEmailsByCustomerId({
                    customer_id: project.customer_id,
                });
                recipientEmails.push(...customerEmails);
            }
        }

        const superAdminUsers = await getAllSuperAdminUsers();
        for (const user of superAdminUsers) {
            recipientEmails.push(user.email);
        }

        const recipients = uniqueEmails(recipientEmails);
        if (!recipients.length) {
            logger.info(
                `server memory alert skipped for server #${server.id}: no recipients`,
            );
            return;
        }

        const serverName = server.name || server.tag || `Server #${server.id}`;
        const checkedAt =
            getReadableDate("DD/MM/YYYY HH:mm:ss", getIstDateTime()) || "—";
        const serverUrl = `${publicBaseUrl()}/app/servers/${server.id}`;

        const html = filer.prepareTemplated("templates/server_memory_alert.html", {
            server_name: serverName,
            server_tag: server.tag || "—",
            project_title: projectTitle,
            customer_name: customerName,
            memory_percent: formatPercent(memoryPercent),
            memory_used: formatMegabytes(memory?.used_mb),
            memory_total: formatMegabytes(memory?.total_mb),
            hostname: body.hostname || "—",
            checked_at: checkedAt,
            server_url: serverUrl,
            app_name: "HammerByte",
        });

        const subject = `High memory alert — ${serverName} (${formatPercent(memoryPercent)}%)`;

        for (const recipient of recipients) {
            transporter.transport({
                recipient,
                subject,
                body: html,
                html_enabled: true,
            });
            logger.info(
                `server memory alert email queued for ${recipient} (server #${server.id})`,
            );
        }

        lastMemoryAlertAtByServerId.set(server.id, Date.now());
    } catch (error) {
        logger.error(`notifyServerHighMemoryAlertIfNeeded: ${error}`);
    }
}
