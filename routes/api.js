import { Elysia } from "elysia";
import { CONSTANTS } from "@hammerbyte/utils";
import parseApplication from "../middlewares/parse_application.js";
import mailer from "./apps/mailer.js";
import bucketizer from "./apps/bucketizer.js";
import inquiries from "./apps/inquiries.js";
import jobApplications, {
    publicJobApplications,
} from "./apps/job_applications.js";
import jobApplicantInterviews from "./apps/job_applicant_interviews.js";
import jobs from "./apps/jobs.js";
import inquiryAdmin from "./apps/inquiry_admin.js";
import inquiryNotes from "./apps/inquiry_notes.js";
import inquiryFollowups from "./apps/inquiry_followups.js";
import authentication from "./apps/authentication.js";
import userAuthenticationTokens from "./apps/user_authentication_tokens.js";
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
import gemCategoryGroups from "./apps/gem_category_groups.js";
import gemCategories from "./apps/gem_categories.js";
import gemTenderCategories from "./apps/gem_tender_categories.js";
import gemScanKeywords from "./apps/gem_scan_keywords.js";
import gemScanner from "./apps/gem_scanner.js";
import gemTenders from "./apps/gem_tenders.js";
import gemTenderComments from "./apps/gem_tender_comments.js";
import gemTenderDocuments from "./apps/gem_tender_documents.js";
import tasks from "./apps/tasks.js";
import taskComments from "./apps/task_comments.js";
import entityComments from "./apps/entity_comments.js";
import taskAttachments from "./apps/task_attachments.js";
import taskReminders from "./apps/task_reminders.js";
import roles from "./apps/roles.js";
import authorities from "./apps/authorities.js";
import roleAuthorities from "./apps/role_authorities.js";
import userRoles from "./apps/user_roles.js";
import servers from "./apps/servers.js";
import monitoredServers from "./apps/monitored_servers.js";
import requireServersBasicAuth from "../middlewares/require_servers_basic_auth.js";
import canUseMailer from "../middlewares/can_use_mailer.js";
import canUseBucketizer from "../middlewares/can_use_bucketizer.js";
import requireApiSession from "../middlewares/require_api_session.js";
import {
    getPublicRulesText,
    getPublicScopeText,
} from "../services/gem_public_texts.js";

export const apiRoutes = new Elysia({ prefix: "/api" })
    .get("/status", () => ({
        status: "online",
        runtime: "Bun",
    }))
    .get("/scope", getPublicScopeText, {
        detail: {
            tags: ["Public"],
            summary: "Public free-text scope document",
        },
    })
    .get("/rules", getPublicRulesText, {
        detail: {
            tags: ["Public"],
            summary: "Public free-text rules document",
        },
    })
    .group("/authentication", authentication)
    .group("/user-authentication-tokens", userAuthenticationTokens)
    .group("/inquiries", inquiries)
    .group("/job-applications", publicJobApplications)
    .group("/contracts", contractsSign)
    .guard({ beforeHandle: [requireServersBasicAuth] }, (app) =>
        app.group("/servers", servers),
    )
    .guard({ beforeHandle: [requireApiSession] }, (app) =>
        app
            .group("/monitored-servers", monitoredServers)
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
            .group("/jobs", jobs)
            .group("/job-applications", jobApplications)
            .group("/job-applicant-interviews", jobApplicantInterviews)
            .group("/contracts", contracts)
            .group("/contract-clauses", contractClauses)
            .group("/clause-subclauses", clauseSubclauses)
            .group("/gem-category-groups", gemCategoryGroups)
            .group("/gem-categories", gemCategories)
            .group("/gem-tender-categories", gemTenderCategories)
            .group("/gem-scan-keywords", gemScanKeywords)
            .group("/gem-scanner", gemScanner)
            .group("/gem-tenders", gemTenders)
            .group("/gem-tender-comments", gemTenderComments)
            .group("/gem-tender-documents", gemTenderDocuments)
            .group("/inquiries", inquiryAdmin)
            .group("/inquiry-notes", inquiryNotes)
            .group("/inquiry-followups", inquiryFollowups)
            .group("/tasks", tasks)
            .group("/task-comments", taskComments)
            .group("/entity-comments", entityComments)
            .group("/task-attachments", taskAttachments)
            .group("/task-reminders", taskReminders)
            .group("/roles", roles)
            .group("/authorities", authorities)
            .group("/role-authorities", roleAuthorities)
            .group("/user-roles", userRoles),
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
