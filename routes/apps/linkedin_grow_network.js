import { t } from "elysia";
import {
    getLinkedinGrowNetworkRun,
    getLinkedinGrowNetworkRuns,
    getLinkedinGrowNetworkStatus,
    startLinkedinGrowNetwork,
} from "../../services/linkedin_grow_network.js";

export default function (app) {
    return app
        .get("/status", getLinkedinGrowNetworkStatus, {
            detail: {
                tags: ["LinkedIn GrowNetwork"],
                summary: "Get GrowNetwork processing status",
            },
        })
        .get("/runs", getLinkedinGrowNetworkRuns, {
            detail: {
                tags: ["LinkedIn GrowNetwork"],
                summary: "List GrowNetwork runs",
            },
        })
        .get("/runs/:id", getLinkedinGrowNetworkRun, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["LinkedIn GrowNetwork"],
                summary: "Get GrowNetwork run",
            },
        })
        .post("/start", startLinkedinGrowNetwork, {
            body: t.Object({
                linkedin_user_ids: t.Array(t.Numeric({ minimum: 1 }), {
                    minItems: 1,
                }),
                designation_ids: t.Array(t.Numeric({ minimum: 1 }), {
                    minItems: 1,
                }),
                per_account_limit: t.Numeric({
                    minimum: 1,
                }),
            }),
            detail: {
                tags: ["LinkedIn GrowNetwork"],
                summary: "Start GrowNetwork connect run",
            },
        });
}
