import { Elysia } from "elysia";
import { CONSTANTS } from "@hammerbyte/utils";
import parseApplication from "../middlewares/parse_application.js";
import mailer from "./apps/mailer.js";
import bucketizer from "./apps/bucketizer.js";
import inquiries from "./apps/inquiries.js";
import authentication from "./apps/authentication.js";
import authenticationTokens from "./apps/authentication_tokens.js";
import customers from "./apps/customers.js";
import customerProjects from "./apps/customer_projects.js";
import projectApplications from "./apps/project_applications.js";
import applicationServices from "./apps/application_services.js";
import expenses from "./apps/expenses.js";
import customerInvoices from "./apps/customer_invoices.js";
import invoiceItems from "./apps/invoice_items.js";
import invoicePayments from "./apps/invoice_payments.js";
import users from "./apps/users.js";
import services from "./apps/services.js";
import media from "./apps/media.js";
import projectDocuments from "./apps/project_documents.js";
import internalDocuments from "./apps/internal_documents.js";
import contracts from "./apps/contracts.js";
import contractsSign from "./apps/contracts_sign.js";
import contractClauses from "./apps/contract_clauses.js";
import clauseSubclauses from "./apps/clause_subclauses.js";
import gemTenderKeywords from "./apps/gem_tender_keywords.js";
import canUseMailer from "../middlewares/can_use_mailer.js";
import canUseBucketizer from "../middlewares/can_use_bucketizer.js";
import requireApiSession from "../middlewares/require_api_session.js";

export const apiRoutes = new Elysia({ prefix: "/api" })
    .get("/status", () => ({
        status: "online",
        runtime: "Bun",
    }))
    .group("/authentication", authentication)
    .group("/authentication-tokens", authenticationTokens)
    .group("/inquiries", inquiries)
    .group("/contracts", contractsSign)
    .guard({ beforeHandle: [requireApiSession] }, (app) =>
        app
            .group("/project-applications", projectApplications)
            .group("/application-services", applicationServices)
            .group("/expenses", expenses)
            .group("/customers", customers)
            .group("/customer-projects", customerProjects)
            .group("/customer-invoices", customerInvoices)
            .group("/invoice-items", invoiceItems)
            .group("/invoice-payments", invoicePayments)
            .group("/users", users)
            .group("/services", services)
            .group("/media", media)
            .group("/project-documents", projectDocuments)
            .group("/internal-documents", internalDocuments)
            .group("/contracts", contracts)
            .group("/contract-clauses", contractClauses)
            .group("/clause-subclauses", clauseSubclauses)
            .group("/gem-tender-keywords", gemTenderKeywords),
    )
    .group("/services", (app) =>
        app
            .derive(parseApplication)
            .guard({ beforeHandle: [canUseBucketizer] }, (protectedApp) =>
                protectedApp.group(`/${CONSTANTS.SAAS.SERVICES.BUCKETIZER}`, bucketizer),
            )
            .guard({ beforeHandle: [canUseMailer] }, (protectedApp) =>
                protectedApp.group(`/${CONSTANTS.SAAS.SERVICES.MAILER}`, mailer),
            ),
    );
