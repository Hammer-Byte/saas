import { t } from "elysia";
import { listAgentReleases, markAgentReleaseLatest } from "../../services/agent_releases.js";

export default function (app) {
    return app
        .get("/", listAgentReleases, {
            detail: {
                tags: ["Agent Releases"],
                summary: "List built agent and service script releases",
            },
        })
        .patch("/:id/latest", markAgentReleaseLatest, {
            params: t.Object({
                id: t.Numeric({ minimum: 1 }),
            }),
            detail: {
                tags: ["Agent Releases"],
                summary: "Mark a release as the latest for its component",
            },
        });
}
