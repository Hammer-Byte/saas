import { getLinkedinDesignationsByIds } from "../db/linkedin_designations.js";
import { getLinkedinUsersByIds } from "../db/linkedin_users.js";
import {
    createLinkedinSearchRun,
    createLinkedinSearchRunAccount,
    createLinkedinSearchRunDesignation,
    getAllLinkedinSearchRunAccounts,
    getAllLinkedinSearchRunDesignations,
    getAllLinkedinSearchRuns,
    getLinkedinSearchRunAccountsByRunId,
    getLinkedinSearchRunById,
    getLinkedinSearchRunDesignationsByRunId,
} from "../db/linkedin_search_runs.js";
import { processing } from "../libs/linkedin_browser.js";
import { startLinkedinSearchConnects } from "../libs/linkedin_search.js";

export async function getLinkedinSearchNetworkStatus({ set }) {
    set.status = 200;
    return { processing };
}

export async function startLinkedinSearchNetwork({ body, set }) {
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

    const runId = await createLinkedinSearchRun({
        per_account_limit: body.per_account_limit,
        page_count: body.page_count,
    });
    if (!runId) {
        set.status = 400;
        return { error: "Failed to create search run", processing: false };
    }

    const runAccounts = [];
    for (const linkedinUser of linkedinUsers) {
        const runAccountId = await createLinkedinSearchRunAccount({
            run_id: runId,
            linkedin_user_id: linkedinUser.id,
            user_name: linkedinUser.name,
        });
        if (!runAccountId) {
            set.status = 400;
            return { error: "Failed to create search run account", processing: false };
        }
        runAccounts.push({
            runAccountId,
            id: linkedinUser.id,
            name: linkedinUser.name,
            cookie: linkedinUser.cookie,
        });
    }

    for (const linkedinDesignation of linkedinDesignations) {
        await createLinkedinSearchRunDesignation({
            run_id: runId,
            designation_name: linkedinDesignation.name,
        });
    }

    const started = startLinkedinSearchConnects({
        runId,
        accounts: runAccounts,
        designationKeywords: linkedinDesignations.map((designation) => designation.name),
        perAccountLimit: body.per_account_limit,
        pageCount: body.page_count,
    });

    if (!started) {
        set.status = 409;
        return { error: "LinkedIn automation already in progress", processing: true };
    }

    set.status = 202;
    return {
        message: "SearchNetwork started",
        processing: true,
        run: await getLinkedinSearchRunById({ id: runId }),
    };
}

export async function getLinkedinSearchNetworkRuns({ set }) {
    const runs = await getAllLinkedinSearchRuns();
    const runAccounts = await getAllLinkedinSearchRunAccounts();
    const runDesignations = await getAllLinkedinSearchRunDesignations();

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

    const linkedinSearchRuns = runs.map((run) => ({
        ...run,
        accounts: accountsByRunId.get(run.id) || [],
        designations: designationsByRunId.get(run.id) || [],
    }));

    set.status = 200;
    return { linkedinSearchRuns, processing };
}

export async function getLinkedinSearchNetworkRun({ params, set }) {
    const linkedinSearchRun = await getLinkedinSearchRunById({ id: params.id });
    if (!linkedinSearchRun) {
        set.status = 404;
        return { error: "Search run not found" };
    }

    set.status = 200;
    return {
        linkedinSearchRun: {
            ...linkedinSearchRun,
            accounts: await getLinkedinSearchRunAccountsByRunId({
                run_id: linkedinSearchRun.id,
            }),
            designations: await getLinkedinSearchRunDesignationsByRunId({
                run_id: linkedinSearchRun.id,
            }),
        },
        processing,
    };
}
