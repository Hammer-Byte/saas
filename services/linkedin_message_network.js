import { getLinkedinDesignationsByIds } from "../db/linkedin_designations.js";
import { getLinkedinDesignationMessagesByDesignationIds } from "../db/linkedin_designation_messages.js";
import { getLinkedinUsersByIds } from "../db/linkedin_users.js";
import {
    createLinkedinMessageRun,
    createLinkedinMessageRunAccount,
    createLinkedinMessageRunDesignation,
    getAllLinkedinMessageRunAccounts,
    getAllLinkedinMessageRunDesignations,
    getAllLinkedinMessageRuns,
    getLinkedinMessageRunAccountsByRunId,
    getLinkedinMessageRunById,
    getLinkedinMessageRunDesignationsByRunId,
} from "../db/linkedin_message_runs.js";
import { processing } from "../libs/linkedin_browser.js";
import { startLinkedinMessageConnects } from "../libs/linkedin_message.js";
import { getCurrentUser } from "./authentication.js";

export async function getLinkedinMessageNetworkStatus({ set }) {
    set.status = 200;
    return { processing };
}

export async function startLinkedinMessageNetwork({ body, set, cookie }) {
    if (processing) {
        set.status = 409;
        return { error: "LinkedIn automation already in progress", processing: true };
    }

    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return { error: "Unauthorized", processing: false };
    }

    const linkedinUsers = await getLinkedinUsersByIds({ ids: body.linkedin_user_ids });
    if (linkedinUsers.length !== body.linkedin_user_ids.length) {
        set.status = 400;
        return { error: "One or more LinkedIn users were not found", processing: false };
    }

    const linkedinDesignations = await getLinkedinDesignationsByIds({
        ids: body.designation_ids,
    });
    if (linkedinDesignations.length !== body.designation_ids.length) {
        set.status = 400;
        return { error: "One or more designations were not found", processing: false };
    }

    const designationMessages = await getLinkedinDesignationMessagesByDesignationIds({
        designation_ids: body.designation_ids,
    });
    const messagesByDesignationId = new Map();
    for (const row of designationMessages) {
        const list = messagesByDesignationId.get(row.designation_id) || [];
        list.push(row.message);
        messagesByDesignationId.set(row.designation_id, list);
    }

    const missing = linkedinDesignations.filter(
        (designation) => !(messagesByDesignationId.get(designation.id) || []).length,
    );
    if (missing.length) {
        set.status = 400;
        return {
            error: `Add at least one message for: ${missing.map((item) => item.name).join(", ")}`,
            processing: false,
        };
    }

    const runId = await createLinkedinMessageRun({
        per_account_limit: body.per_account_limit,
        created_by: currentUser.id,
    });
    if (!runId) {
        set.status = 400;
        return { error: "Failed to create message run", processing: false };
    }

    const runAccounts = [];
    for (const linkedinUser of linkedinUsers) {
        const runAccountId = await createLinkedinMessageRunAccount({
            run_id: runId,
            linkedin_user_id: linkedinUser.id,
            user_name: linkedinUser.name,
        });
        if (!runAccountId) {
            set.status = 400;
            return { error: "Failed to create message run account", processing: false };
        }
        runAccounts.push({
            runAccountId,
            id: linkedinUser.id,
            name: linkedinUser.name,
            cookie: linkedinUser.cookie,
        });
    }

    const designationPools = [];
    for (const linkedinDesignation of linkedinDesignations) {
        await createLinkedinMessageRunDesignation({
            run_id: runId,
            designation_name: linkedinDesignation.name,
        });
        designationPools.push({
            name: linkedinDesignation.name,
            messages: messagesByDesignationId.get(linkedinDesignation.id) || [],
        });
    }

    const started = startLinkedinMessageConnects({
        runId,
        accounts: runAccounts,
        designationPools,
        perAccountLimit: body.per_account_limit,
    });

    if (!started) {
        set.status = 409;
        return { error: "LinkedIn automation already in progress", processing: true };
    }

    set.status = 202;
    return {
        message: "MessageNetwork started",
        processing: true,
        run: await getLinkedinMessageRunById({ id: runId }),
    };
}

export async function getLinkedinMessageNetworkRuns({ set }) {
    const runs = await getAllLinkedinMessageRuns();
    const runAccounts = await getAllLinkedinMessageRunAccounts();
    const runDesignations = await getAllLinkedinMessageRunDesignations();

    const accountsByRunId = new Map();
    for (const runAccount of runAccounts) {
        const list = accountsByRunId.get(runAccount.run_id) || [];
        list.push(runAccount);
        accountsByRunId.set(runAccount.run_id, list);
    }

    const designationsByRunId = new Map();
    for (const runDesignation of runDesignations) {
        const list = designationsByRunId.get(runDesignation.run_id) || [];
        list.push(runDesignation);
        designationsByRunId.set(runDesignation.run_id, list);
    }

    const linkedinMessageRuns = runs.map((run) => ({
        ...run,
        accounts: accountsByRunId.get(run.id) || [],
        designations: designationsByRunId.get(run.id) || [],
    }));

    set.status = 200;
    return { linkedinMessageRuns, processing };
}

export async function getLinkedinMessageNetworkRun({ params, set }) {
    const linkedinMessageRun = await getLinkedinMessageRunById({ id: params.id });
    if (!linkedinMessageRun) {
        set.status = 404;
        return { error: "Message run not found" };
    }

    set.status = 200;
    return {
        linkedinMessageRun: {
            ...linkedinMessageRun,
            accounts: await getLinkedinMessageRunAccountsByRunId({
                run_id: linkedinMessageRun.id,
            }),
            designations: await getLinkedinMessageRunDesignationsByRunId({
                run_id: linkedinMessageRun.id,
            }),
        },
        processing,
    };
}
