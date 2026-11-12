import { t } from "elysia";
import {
    getSeleniumJob,
    getSeleniumJobs,
    getSeleniumStatus,
    pauseSelenium,
    resumeSelenium,
    skipSeleniumJobHandler,
    stopSeleniumJobHandler,
    updateSeleniumParallel,
} from "../../services/selenium.js";

export default function (app) {
    return app
        .get("/status", getSeleniumStatus, {
            detail: {
                tags: ["Selenium"],
                summary: "Selenium pipeline status",
            },
        })
        .get("/jobs", getSeleniumJobs, {
            query: t.Object({
                from: t.Optional(t.String()),
                to: t.Optional(t.String()),
                status: t.Optional(t.String()),
                source: t.Optional(t.String()),
            }),
            detail: {
                tags: ["Selenium"],
                summary: "List selenium jobs for a date range",
            },
        })
        .get("/jobs/:id", getSeleniumJob, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Selenium"],
                summary: "Get selenium job",
            },
        })
        .post("/pause", pauseSelenium, {
            detail: {
                tags: ["Selenium"],
                summary: "Pause selenium pipeline (stop claiming new jobs)",
            },
        })
        .post("/resume", resumeSelenium, {
            detail: {
                tags: ["Selenium"],
                summary: "Resume selenium pipeline",
            },
        })
        .patch("/max-parallel", updateSeleniumParallel, {
            body: t.Object({
                max_parallel: t.Numeric({ minimum: 1, maximum: 8 }),
            }),
            detail: {
                tags: ["Selenium"],
                summary: "Set max parallel selenium jobs",
            },
        })
        .post("/jobs/:id/stop", stopSeleniumJobHandler, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Selenium"],
                summary: "Stop a running selenium job",
            },
        })
        .post("/jobs/:id/skip", skipSeleniumJobHandler, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["Selenium"],
                summary: "Skip a queued selenium job",
            },
        });
}
