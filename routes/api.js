import { Elysia } from "elysia";
import { CONSTANTS } from "@hammerbyte/utils";
import parseApplication from "../middlewares/parse_application.js";
import mailer from "./apps/mailer.js";
import bucketizer from "./apps/bucketizer.js";
import canUseMailer from "../middlewares/can_use_mailer.js";
import canUseBucketizer from "../middlewares/can_use_bucketizer.js";


export const apiRoutes = new Elysia({ prefix: "/api" })
    .get("/status", () => ({
        status: "online",
        runtime: "Bun",
    }))
    .group("/services", (app) =>
        app
            .derive(parseApplication)
            .guard({ beforeHandle: [canUseMailer] }, (protectedApp) =>
                protectedApp.group(`/${CONSTANTS.SAAS.SERVICES.MAILER}`, mailer),
            )
            .guard({ beforeHandle: [canUseBucketizer] }, (protectedApp) =>
                protectedApp.group(`/${CONSTANTS.SAAS.SERVICES.BUCKETIZER}`, bucketizer),
            ),
    );
