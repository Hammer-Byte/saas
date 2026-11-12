import {
    countRunningSeleniumJobs,
    getSeleniumJobStatusCountsByCreatedOnRange,
    getSeleniumJobsByCreatedOnRange,
} from "../../db/selenium_jobs.js";
import {
    ensureSeleniumPipelineState,
    getSeleniumPipelineState,
    updateSeleniumPipelineState,
} from "../../db/selenium_pipeline_state.js";
import {
    getSeleniumActiveWorkerCount,
    kickSeleniumPipeline,
    skipSeleniumJob,
    stopSeleniumJob,
} from "./pipeline.js";

export async function getSeleniumPipelineStatus() {
    const state = await ensureSeleniumPipelineState();
    const runningInDb = await countRunningSeleniumJobs();
    return {
        paused: !!state?.paused,
        max_parallel: state?.max_parallel || 1,
        active_workers: getSeleniumActiveWorkerCount(),
        running_jobs: runningInDb,
    };
}

export async function pauseSeleniumPipeline() {
    const state = await updateSeleniumPipelineState({ paused: true });
    return {
        paused: !!state?.paused,
        max_parallel: state?.max_parallel || 1,
        active_workers: getSeleniumActiveWorkerCount(),
    };
}

export async function resumeSeleniumPipeline() {
    const state = await updateSeleniumPipelineState({ paused: false });
    kickSeleniumPipeline();
    return {
        paused: !!state?.paused,
        max_parallel: state?.max_parallel || 1,
        active_workers: getSeleniumActiveWorkerCount(),
    };
}

export async function setSeleniumMaxParallel({ max_parallel }) {
    const state = await updateSeleniumPipelineState({
        max_parallel: Math.max(1, Number(max_parallel) || 1),
    });
    kickSeleniumPipeline();
    return {
        paused: !!state?.paused,
        max_parallel: state?.max_parallel || 1,
        active_workers: getSeleniumActiveWorkerCount(),
    };
}

export {
    getSeleniumPipelineState,
    getSeleniumJobsByCreatedOnRange,
    getSeleniumJobStatusCountsByCreatedOnRange,
    skipSeleniumJob,
    stopSeleniumJob,
};
