import { t } from "elysia";
import {
    getLinkedinSearchNetworkRun,
    getLinkedinSearchNetworkRuns,
    getLinkedinSearchNetworkStatus,
    startLinkedinSearchNetwork,
} from "../../services/linkedin_search_network.js";

export default function (app) {
    return app
        .get("/status", getLinkedinSearchNetworkStatus, {
            detail: {
                tags: ["LinkedIn SearchNetwork"],
                summary: "Get SearchNetwork processing status",
            },
        })
        .get("/runs", getLinkedinSearchNetworkRuns, {
            detail: {
                tags: ["LinkedIn SearchNetwork"],
                summary: "List SearchNetwork runs",
            },
        })
        .get("/runs/:id", getLinkedinSearchNetworkRun, {
            params: t.Object({
                id: t.Numeric(),
            }),
            detail: {
                tags: ["LinkedIn SearchNetwork"],
                summary: "Get SearchNetwork run",
            },
        })
        .post("/start", startLinkedinSearchNetwork, {
            body: t.Object({
                linkedin_user_ids: t.Array(t.Numeric({ minimum: 1 }), {
                    minItems: 1,
                }),
                designation_ids: t.Array(t.Numeric({ minimum: 1 }), {
                    minItems: 1,
                }),
                page_count: t.Numeric({
                    minimum: 1,
                }),
            }),
            detail: {
                tags: ["LinkedIn SearchNetwork"],
                summary: "Start SearchNetwork connect run",
            },
        });
}
