import { getLinkedinDesignationsByIds } from "../db/linkedin_designations.js";
import { getLinkedinUsersByIds } from "../db/linkedin_users.js";
import {
    createLinkedinGrowRun,
    createLinkedinGrowRunAccount,
    createLinkedinGrowRunDesignation,
    getAllLinkedinGrowRunAccounts,
    getAllLinkedinGrowRunDesignations,
    getAllLinkedinGrowRuns,
    getLinkedinGrowRunAccountsByRunId,
    getLinkedinGrowRunById,
    getLinkedinGrowRunDesignationsByRunId,
} from "../db/linkedin_grow_runs.js";
import { processing } from "../libs/linkedin_browser.js";
import { startLinkedinGrowConnects } from "../libs/linkedin_connects.js";

export async function getLinkedinGrowNetworkStatus({ set }) {
    set.status = 200;
    return { processing };
}

export async function startLinkedinGrowNetwork({ body, set }) {
    if (processing) {
        set.status = 409;
        return { error: "LinkedIn automation already in progress", processing: true };
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

    const runId = await createLinkedinGrowRun({
        per_account_limit: body.per_account_limit,
    });
    if (!runId) {
        set.status = 400;
        return { error: "Failed to create grow run", processing: false };
    }

    const runAccounts = [];
    for (const linkedinUser of linkedinUsers) {
        const runAccountId = await createLinkedinGrowRunAccount({
            run_id: runId,
            linkedin_user_id: linkedinUser.id,
            user_name: linkedinUser.name,
        });
        if (!runAccountId) {
            set.status = 400;
            return { error: "Failed to create grow run account", processing: false };
        }
        runAccounts.push({
            runAccountId,
            id: linkedinUser.id,
            name: linkedinUser.name,
            cookie: linkedinUser.cookie,
        });
    }

    for (const linkedinDesignation of linkedinDesignations) {
        await createLinkedinGrowRunDesignation({
            run_id: runId,
            designation_name: linkedinDesignation.name,
        });
    }

    const started = startLinkedinGrowConnects({
        runId,
        accounts: runAccounts,
        designationKeywords: linkedinDesignations.map((designation) => designation.name),
        perAccountLimit: body.per_account_limit,
    });

    if (!started) {
        set.status = 409;
        return { error: "LinkedIn automation already in progress", processing: true };
    }

    set.status = 202;
    return {
        message: "GrowNetwork started",
        processing: true,
        run: await getLinkedinGrowRunById({ id: runId }),
    };
}

export async function getLinkedinGrowNetworkRuns({ set }) {
    const runs = await getAllLinkedinGrowRuns();
    const runAccounts = await getAllLinkedinGrowRunAccounts();
    const runDesignations = await getAllLinkedinGrowRunDesignations();

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

    const linkedinGrowRuns = runs.map((run) => ({
        ...run,
        accounts: accountsByRunId.get(run.id) || [],
        designations: designationsByRunId.get(run.id) || [],
    }));

    set.status = 200;
    return { linkedinGrowRuns, processing };
}

export async function getLinkedinGrowNetworkRun({ params, set }) {
    const linkedinGrowRun = await getLinkedinGrowRunById({ id: params.id });
    if (!linkedinGrowRun) {
        set.status = 404;
        return { error: "Grow run not found" };
    }

    set.status = 200;
    return {
        linkedinGrowRun: {
            ...linkedinGrowRun,
            accounts: await getLinkedinGrowRunAccountsByRunId({ run_id: linkedinGrowRun.id }),
            designations: await getLinkedinGrowRunDesignationsByRunId({
                run_id: linkedinGrowRun.id,
            }),
        },
        processing,
    };
}
