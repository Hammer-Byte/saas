import { t } from "elysia";
import {
    getLinkedinMessageNetworkRun,
    getLinkedinMessageNetworkRuns,
    getLinkedinMessageNetworkStatus,
    startLinkedinMessageNetwork,
} from "../../services/linkedin_message_network.js";

export default function (app) {
    return app
        .get("/status", getLinkedinMessageNetworkStatus, {
            detail: {
                tags: ["LinkedIn MessageNetwork"],
                summary: "Get MessageNetwork processing status",
            },
        })
        .get("/runs", getLinkedinMessageNetworkRuns, {
            detail: {
                tags: ["LinkedIn MessageNetwork"],
                summary: "List MessageNetwork runs",
            },
        })
        .get("/runs/:id", getLinkedinMessageNetworkRun, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["LinkedIn MessageNetwork"],
                summary: "Get MessageNetwork run",
            },
        })
        .post("/start", startLinkedinMessageNetwork, {
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
                tags: ["LinkedIn MessageNetwork"],
                summary: "Start MessageNetwork messaging run",
            },
        });
}