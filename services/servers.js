import { logger } from "@hammerbyte/utils";
import { getCustomerEmailsByCustomerId } from "../db/customer_emails.js";
import { getCustomerPhonesByCustomerId } from "../db/customer_phones.js";
import { getCustomerProjectById } from "../db/customer_projects.js";
import { createServerDataerRun } from "../db/server_dataer_runs.js";
import { createServerDberRun } from "../db/server_dber_runs.js";
import { createServerMetric, getLatestServerMetricByServerId } from "../db/server_metrics.js";
import { createServerPing } from "../db/server_pings.js";
import {
    createServer,
    deleteServerById,
    getServerById,
    getServerByMappedTag,
    getServerByUnmappedOtp,
    markServerTagMappedById,
    updateServerAlertConfigById,
    updateServerById,
} from "../db/servers.js";
import { evaluateMetricerAlerts } from "../libs/server_alert_notify.js";
import { buildAlertCandidates, parseAlertConfig } from "../libs/server_alerts.js";
import { generateOTP } from "../libs/utils.js";

async function allocateServerOtp() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const otp = generateOTP();
        const existingServer = await getServerByUnmappedOtp({ otp });
        if (!existingServer) {
            return otp;
        }
    }
    return null;
}

async function resolveProjectId({ project_id, set }) {
    if (project_id == null) {
        return { projectId: null };
    }

    const existingProject = await getCustomerProjectById({ id: project_id });
    if (!existingProject) {
        set.status = 404;
        return { error: "Project not found" };
    }

    return { projectId: existingProject.id };
}

function asNullableString(value, maxLength = null) {
    if (value == null) {
        return null;
    }
    const text = String(value).trim();
    if (!text) {
        return null;
    }
    if (maxLength != null) {
        return text.slice(0, maxLength);
    }
    return text;
}

function asNullableNumber(value) {
    if (value == null || value === "") {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function asNullableBoolean(value) {
    if (value == null) {
        return null;
    }
    return Boolean(value);
}

async function resolveMappedServerFromTag({ body, set }) {
    const tag = asNullableString(body.TAG);
    if (!tag) {
        set.status = 401;
        return { error: "TAG is required" };
    }

    const mappedServer = await getServerByMappedTag({ tag });
    if (!mappedServer) {
        set.status = 401;
        return { error: "Invalid or unmapped TAG" };
    }

    return { mappedServer };
}

async function handleCreateTag({ body, set }) {
    const otp = String(body.otp || "").trim();
    if (!/^\d{4}$/.test(otp)) {
        set.status = 401;
        return { error: "Invalid OTP" };
    }

    const existingServer = await getServerByUnmappedOtp({ otp });
    if (!existingServer) {
        set.status = 401;
        return { error: "No unmapped server found for this OTP" };
    }

    await markServerTagMappedById({ id: existingServer.id });

    set.status = 201;
    return { tag_id: existingServer.tag };
}

async function handlePinger({ body, set }) {
    const tagResult = await resolveMappedServerFromTag({ body, set });
    if (tagResult.error) {
        return { error: tagResult.error };
    }

    await createServerPing({
        server_id: tagResult.mappedServer.id,
        client_timestamp: asNullableString(body.timestamp, 64),
        payload: JSON.stringify(body),
    });

    set.status = 201;
    return { ok: true };
}

async function handleMetricer({ body, set }) {
    const tagResult = await resolveMappedServerFromTag({ body, set });
    if (tagResult.error) {
        return { error: tagResult.error };
    }

    await createServerMetric({
        server_id: tagResult.mappedServer.id,
        client_timestamp: asNullableString(body.timestamp, 64),
        payload: JSON.stringify(body),
    });

    // Fresh row picks up latest alert_config/state for cooldown stamps.
    const server = (await getServerById({ id: tagResult.mappedServer.id })) || tagResult.mappedServer;
    await evaluateMetricerAlerts({ server, payload: body });

    set.status = 201;
    return { ok: true };
}

async function handleDataer({ body, set }) {
    const tagResult = await resolveMappedServerFromTag({ body, set });
    if (tagResult.error) {
        return { error: tagResult.error };
    }

    await createServerDataerRun({
        server_id: tagResult.mappedServer.id,
        host: asNullableString(body.host, 256),
        remote: asNullableString(body.remote, 512),
        local_path: asNullableString(body.local, 512),
        interval_seconds: asNullableNumber(body.intervalSeconds),
        success: asNullableBoolean(body.success),
        result: asNullableString(body.result, 512),
        duration_seconds: asNullableNumber(body.durationSeconds),
        finished_at: asNullableString(body.finishedAt, 64),
        detail: asNullableString(body.detail),
        client_timestamp: asNullableString(body.timestamp, 64),
        payload: JSON.stringify(body),
    });

    set.status = 201;
    return { ok: true };
}

async function handleDber({ body, set }) {
    const tagResult = await resolveMappedServerFromTag({ body, set });
    if (tagResult.error) {
        return { error: tagResult.error };
    }

    await createServerDberRun({
        server_id: tagResult.mappedServer.id,
        from_host: asNullableString(body.fromHost, 256),
        from_database: asNullableString(body.fromDatabase, 256),
        to_host: asNullableString(body.toHost, 256),
        to_database: asNullableString(body.toDatabase, 256),
        interval_seconds: asNullableNumber(body.intervalSeconds),
        success: asNullableBoolean(body.success),
        result: asNullableString(body.result, 512),
        duration_seconds: asNullableNumber(body.durationSeconds),
        finished_at: asNullableString(body.finishedAt, 64),
        bacpac_path: asNullableString(body.bacpacPath, 1024),
        detail: asNullableString(body.detail),
        client_timestamp: asNullableString(body.timestamp, 64),
        payload: JSON.stringify(body),
    });

    set.status = 201;
    return { ok: true };
}

export async function addServer({ body, set }) {
    const projectResult = await resolveProjectId({
        project_id: body.project_id ?? null,
        set,
    });
    if (projectResult.error) {
        return { error: projectResult.error };
    }

    const otp = await allocateServerOtp();
    if (!otp) {
        set.status = 500;
        return { error: "Could not allocate a unique OTP" };
    }

    const notes =
        body.notes == null || String(body.notes).trim() === ""
            ? null
            : String(body.notes).trim();

    const id = await createServer({
        name: body.name.trim(),
        location: body.location.trim(),
        project_id: projectResult.projectId,
        notes,
        tag: crypto.randomUUID(),
        otp,
        active: body.active === false ? false : undefined,
    });

    if (!id) {
        set.status = 500;
        return { error: "Failed to create server" };
    }

    const server = await getServerById({ id });
    set.status = 201;
    return { message: "Server created", server };
}

export async function updateServer({ body, set }) {
    const existingServer = await getServerById({ id: body.id });
    if (!existingServer) {
        set.status = 404;
        return { error: "Server not found" };
    }

    const projectResult = await resolveProjectId({
        project_id: body.project_id ?? null,
        set,
    });
    if (projectResult.error) {
        return { error: projectResult.error };
    }

    const notes =
        body.notes == null || String(body.notes).trim() === ""
            ? null
            : String(body.notes).trim();

    await updateServerById({
        id: body.id,
        name: body.name.trim(),
        location: body.location.trim(),
        project_id: projectResult.projectId,
        notes,
        active: Boolean(body.active),
    });

    const server = await getServerById({ id: body.id });
    set.status = 200;
    return { message: "Server updated", server };
}

export async function deleteServer({ params, set }) {
    const existingServer = await getServerById({ id: params.id });
    if (!existingServer) {
        set.status = 404;
        return { error: "Server not found" };
    }

    await deleteServerById({ id: params.id });
    set.status = 204;
}

export async function loadServerAlertCandidates({ server }) {
    if (!server?.project_id) {
        return [];
    }
    const project = await getCustomerProjectById({ id: server.project_id });
    if (!project?.customer_id) {
        return [];
    }
    const [emails, phones] = await Promise.all([
        getCustomerEmailsByCustomerId({ customer_id: project.customer_id }),
        getCustomerPhonesByCustomerId({ customer_id: project.customer_id }),
    ]);
    return buildAlertCandidates({
        customerName: server.customer_name || "Contact",
        emails,
        phones,
    });
}

export async function updateServerAlerts({ params, body, set }) {
    const id = Number(params.id);
    const existingServer = await getServerById({ id });
    if (!existingServer) {
        set.status = 404;
        return { error: "Server not found" };
    }

    const alert_config = parseAlertConfig(body?.alert_config ?? body);
    await updateServerAlertConfigById({ id, alert_config });
    const server = await getServerById({ id });

    // Re-check latest stored sample so Metricer can fire without waiting for next ingest.
    try {
        const latestMetric = await getLatestServerMetricByServerId({ server_id: id });
        if (latestMetric?.payload && server) {
            let payload = latestMetric.payload;
            if (typeof payload === "string") {
                payload = JSON.parse(payload);
            }
            if (payload && typeof payload === "object") {
                await evaluateMetricerAlerts({ server, payload });
            }
        }
    } catch (error) {
        logger.error(`updateServerAlerts metric re-eval: ${error}`);
    }

    set.status = 200;
    return {
        message: "Alert settings saved",
        alert_config: parseAlertConfig(server?.alert_config),
    };
}

export async function handleServerRequest({ body, set }) {
    const type = String(body?.TYPE || "").trim();

    if (type === "CREATE_TAG") {
        return handleCreateTag({ body, set });
    }
    if (type === "PINGER") {
        return handlePinger({ body, set });
    }
    if (type === "Metricer") {
        return handleMetricer({ body, set });
    }
    if (type === "Dataer") {
        return handleDataer({ body, set });
    }
    if (type === "DBer") {
        return handleDber({ body, set });
    }

    set.status = 401;
    return { error: "Unsupported request type" };
}
