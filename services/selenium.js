import { AUTHORITIES } from "../constants.js";
import { getSeleniumJobById } from "../db/selenium_jobs.js";
import { getIstDate, parseQueryDate } from "../libs/date.js";
import {
    getSeleniumJobStatusCountsByCreatedOnRange,
    getSeleniumJobsByCreatedOnRange,
    getSeleniumPipelineStatus,
    pauseSeleniumPipeline,
    resumeSeleniumPipeline,
    setSeleniumMaxParallel,
    skipSeleniumJob,
    stopSeleniumJob,
} from "../libs/selenium/index.js";
import { getCurrentUser } from "./authentication.js";

function canUseAutomation(authorities, { super_admin } = {}) {
    if (super_admin) {
        return true;
    }
    return (authorities || []).includes(AUTHORITIES.USE_PAGE_AUTOMATION);
}

async function requireAutomationUser({ cookie, set }) {
    const currentUser = await getCurrentUser({ cookie });
    if (!currentUser?.id) {
        set.status = 401;
        return null;
    }
    if (
        !canUseAutomation(currentUser.authorities, {
            super_admin: currentUser.super_admin,
        })
    ) {
        set.status = 403;
        return null;
    }
    return currentUser;
}

function resolveDateRange(query = {}) {
    const today = getIstDate();
    const from = parseQueryDate(query.from) || today;
    const to = parseQueryDate(query.to) || today;
    return {
        from: from <= to ? from : to,
        to: from <= to ? to : from,
    };
}

export async function getSeleniumStatus({ cookie, set }) {
    const currentUser = await requireAutomationUser({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
        };
    }
    return await getSeleniumPipelineStatus();
}

export async function getSeleniumJobs({ cookie, set, query }) {
    const currentUser = await requireAutomationUser({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
        };
    }

    const { from, to } = resolveDateRange(query);
    const status = query?.status ? String(query.status).trim().toLowerCase() : null;
    const jobs = await getSeleniumJobsByCreatedOnRange({
        start: from,
        end: to,
        status: status && status !== "all" ? status : null,
    });
    const counts = await getSeleniumJobStatusCountsByCreatedOnRange({
        start: from,
        end: to,
    });
    const pipeline = await getSeleniumPipelineStatus();

    return {
        from,
        to,
        status: status || "all",
        counts,
        jobs,
        pipeline,
    };
}

export async function getSeleniumJob({ cookie, set, params }) {
    const currentUser = await requireAutomationUser({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
        };
    }

    const job = await getSeleniumJobById({ id: params.id });
    if (!job) {
        set.status = 404;
        return { error: "Job not found" };
    }
    return { job };
}

export async function pauseSelenium({ cookie, set }) {
    const currentUser = await requireAutomationUser({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
        };
    }
    return await pauseSeleniumPipeline();
}

export async function resumeSelenium({ cookie, set }) {
    const currentUser = await requireAutomationUser({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
        };
    }
    return await resumeSeleniumPipeline();
}

export async function updateSeleniumParallel({ cookie, set, body }) {
    const currentUser = await requireAutomationUser({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
        };
    }
    return await setSeleniumMaxParallel({
        max_parallel: body?.max_parallel,
    });
}

export async function stopSeleniumJobHandler({ cookie, set, params }) {
    const currentUser = await requireAutomationUser({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
        };
    }

    const result = await stopSeleniumJob({ id: params.id });
    if (result.error) {
        set.status = result.status || 400;
        return { error: result.error };
    }
    return result;
}

export async function skipSeleniumJobHandler({ cookie, set, params }) {
    const currentUser = await requireAutomationUser({ cookie, set });
    if (!currentUser) {
        return {
            error: set.status === 401 ? "Unauthorized" : "Missing authority",
        };
    }

    const result = await skipSeleniumJob({ id: params.id });
    if (result.error) {
        set.status = result.status || 400;
        return { error: result.error };
    }
    return result;
}

export { canUseAutomation, resolveDateRange };
