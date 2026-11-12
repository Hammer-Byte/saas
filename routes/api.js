import { Elysia } from "elysia";
import { CONSTANTS } from "@hammerbyte/utils";
import parseApplication from "../middlewares/parse_application.js";
import mailer from "./apps/mailer.js";
import bucketizer from "./apps/bucketizer.js";
import inquiries from "./apps/inquiries.js";
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
import gemKeywordTenders from "./apps/gem_keyword_tenders.js";
import gemKeywordTenderComments from "./apps/gem_keyword_tender_comments.js";
import gemKeywordTenderDocuments from "./apps/gem_keyword_tender_documents.js";
import tasks from "./apps/tasks.js";
import taskComments from "./apps/task_comments.js";
import taskAttachments from "./apps/task_attachments.js";
import taskReminders from "./apps/task_reminders.js";
import automationUsers from "./apps/automation_users.js";
import contentPublish from "./apps/content_publish.js";
import { getContentPublishPublicMedia } from "../services/content_publish.js";
import linkedinDesignations from "./apps/linkedin_designations.js";
import linkedinGrowNetwork from "./apps/linkedin_grow_network.js";
import linkedinSearchNetwork from "./apps/linkedin_search_network.js";
import linkedinDesignationMessages from "./apps/linkedin_designation_messages.js";
import linkedinMessageNetwork from "./apps/linkedin_message_network.js";
import roles from "./apps/roles.js";
import authorities from "./apps/authorities.js";
import roleAuthorities from "./apps/role_authorities.js";
import userRoles from "./apps/user_roles.js";
import servers from "./apps/servers.js";
import monitoredServers from "./apps/monitored_servers.js";
import serverMetrics from "./apps/server_metrics.js";
import canUseMailer from "../middlewares/can_use_mailer.js";
import canUseBucketizer from "../middlewares/can_use_bucketizer.js";
import canUseContentPublisher from "../middlewares/can_use_content_publisher.js";
import contentPublisher from "./apps/content_publisher.js";
import { CONTENT_PUBLISHER_SERVICE } from "../constants.js";
import requireApiSession from "../middlewares/require_api_session.js";

export const apiRoutes = new Elysia({ prefix: "/api" })
    .get("/status", () => ({
        status: "online",
        runtime: "Bun",
    }))
    .group("/authentication", authentication)
    .group("/user-authentication-tokens", userAuthenticationTokens)
    .group("/inquiries", inquiries)
    .group("/contracts", contractsSign)
    .group("/servers", servers)
    // Meta Instagram Graph API must fetch image_url without a session cookie.
    .get("/content-publish/public-media/:token", getContentPublishPublicMedia, {
        detail: {
            tags: ["Content Publish"],
            summary: "Public signed media URL for Instagram Graph publishing",
        },
    })
    .guard({ beforeHandle: [requireApiSession] }, (app) =>
        app
            .group("/monitored-servers", monitoredServers)
            .group("/server-metrics", serverMetrics)
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
            .group("/gem-category-groups", gemCategoryGroups)
            .group("/gem-categories", gemCategories)
            .group("/gem-tender-categories", gemTenderCategories)
            .group("/gem-scan-keywords", gemScanKeywords)
            .group("/gem-scanner", gemScanner)
            .group("/gem-keyword-tenders", gemKeywordTenders)
            .group("/gem-keyword-tender-comments", gemKeywordTenderComments)
            .group("/gem-keyword-tender-documents", gemKeywordTenderDocuments)
            .group("/inquiries", inquiryAdmin)
            .group("/inquiry-notes", inquiryNotes)
            .group("/inquiry-followups", inquiryFollowups)
            .group("/tasks", tasks)
            .group("/task-comments", taskComments)
            .group("/task-attachments", taskAttachments)
            .group("/task-reminders", taskReminders)
            .group("/automation-users", automationUsers)
            .group("/content-publish", contentPublish)
            .group("/linkedin-designations", linkedinDesignations)
            .group("/linkedin-grow-network", linkedinGrowNetwork)
            .group("/linkedin-search-network", linkedinSearchNetwork)
            .group("/linkedin-designation-messages", linkedinDesignationMessages)
            .group("/linkedin-message-network", linkedinMessageNetwork)
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
            )
            .guard({ beforeHandle: [canUseContentPublisher] }, (protectedApp) =>
                protectedApp.group(`/${CONTENT_PUBLISHER_SERVICE}`, contentPublisher),
            ),
    );
