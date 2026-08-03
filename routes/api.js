import { Elysia } from "elysia";
import { CONSTANTS } from "@hammerbyte/utils";
import parseApplication from "../middlewares/parse_application.js";
import mailer from "./apps/mailer.js";
import bucketizer from "./apps/bucketizer.js";
import inquiries from "./apps/inquiries.js";
import auth from "./apps/auth.js";
import customers from "./apps/customers.js";
import applications from "./apps/applications.js";
import projectTags from "./apps/project_tags.js";
import canUseMailer from "../middlewares/can_use_mailer.js";
import canUseBucketizer from "../middlewares/can_use_bucketizer.js";
import requireApiSession from "../middlewares/require_api_session.js";

export const apiRoutes = new Elysia({ prefix: "/api" })
    .get("/status", () => ({
        status: "online",
        runtime: "Bun",
    }))
    .group("/auth", auth)
    .group("/inquiries", inquiries)
    .guard({ beforeHandle: [requireApiSession] }, (app) =>
        app
            .group("/applications", (group) => applications(customers(group)))
            .group("/project-tags", projectTags),
    )
    .group("/services", (app) =>
        app
            .derive(parseApplication)
            .guard({ beforeHandle: [canUseBucketizer] }, (protectedApp) =>
                protectedApp.group(`/${CONSTANTS.SAAS.SERVICES.BUCKETIZER}`, bucketizer),
            )
            .guard({ beforeHandle: [canUseMailer] }, (protectedApp) =>
                protectedApp.group(`/${CONSTANTS.SAAS.SERVICES.MAILER}`, mailer),
            )
    );
