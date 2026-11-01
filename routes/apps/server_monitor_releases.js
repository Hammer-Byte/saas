import { t } from "elysia";
import { ERRORS } from "../../constants.js";
import {
    addServerMonitorRelease,
    getServerMonitorReleases,
} from "../../services/server_monitor_releases.js";

export default function (app) {
    return app
        .get("/", getServerMonitorReleases, {
            detail: {
                tags: ["Server Monitor Releases"],
                summary: "List server monitor releases",
            },
        })
        .post("/", addServerMonitorRelease, {
            body: t.Object({
                kind: t.Union([t.Literal("agent"), t.Literal("supervisor")]),
                version: t.String({ minLength: 1, maxLength: 32 }),
                file: t.File({ error: ERRORS.FILE_REQUIRED }),
            }),
            detail: {
                tags: ["Server Monitor Releases"],
                summary: "Publish agent or supervisor release",
            },
        });
}
