import { join } from "node:path";
import { Elysia } from "elysia";
import { CONSTANTS } from "@hammerbyte/utils";
import requireSession from "../middlewares/require_session.js";
import { getCurrentUser } from "../services/authentication.js";
import { appPage } from "../libs/app_page.js";
import { getAllRoles } from "../db/roles.js";
import { getAllAuthorities } from "../db/authorities.js";
import {
    getAllProjectApplications,
    getProjectApplicationById,
    getProjectApplicationsByProjectId,
} from "../db/project_applications.js";
import { getAllServices } from "../db/services.js";
import { getAllApplicationServicesByApplicationId, getApplicationServiceById } from "../db/application_services.js";
import { getAllInquiries } from "../db/inquiries.js";
import { getMailsByApplicationServiceId } from "../db/mails.js";
import {
    getFilesByApplicationServiceId,
    getTotalFileSizeByApplicationServiceId,
} from "../db/files.js";
import { updateFileSizesByApplicationServiceId } from "../services/bucketizer.js";
import { getAllCustomers, getCustomerById } from "../db/customers.js";
import { getCustomerEmailsByCustomerId } from "../db/customer_emails.js";
import { getCustomerPhonesByCustomerId } from "../db/customer_phones.js";
import {
    getAllCustomerProjects,
    getCustomerProjectById,
    getCustomerProjectsByCustomerId,
} from "../db/customer_projects.js";
import { getProjectDocumentsByProjectId } from "../db/project_documents.js";
import { getAllInternalDocuments } from "../db/internal_documents.js";
import { getAllServers, getServerById } from "../db/servers.js";
import { getServerMetricsByServerId } from "../db/server_metrics.js";
import { getExpensesByCreatedOnRange, getExpensesByDateRange } from "../db/expenses.js";
import {
    getAllCustomerInvoices,
    getCustomerInvoiceById,
    getCustomerInvoicesByProjectId,
} from "../db/customer_invoices.js";
import { getInvoiceItemsByCustomerInvoiceId } from "../db/invoice_items.js";
import {
    getInvoicePaymentsByCreatedOnRange,
    getInvoicePaymentsByCustomerInvoiceId,
} from "../db/invoice_payments.js";
import { getAllUsers } from "../db/users.js";
import { getAllContracts, getContractById, getContractBySigningCode } from "../db/contracts.js";
import { getContractClausesByContractId } from "../db/contract_clauses.js";
import { getClauseSubclausesByContractId } from "../db/clause_subclauses.js";
import { getAllContractAttachments } from "../db/contract_attachments.js";
import { getContractRequiredAttachmentsByContractId } from "../db/contract_required_attachments.js";
import { getAllGemTenderKeywords } from "../db/gem_tender_keywords.js";
import {
    getAllGemKeywordTenders,
    getGemKeywordTenderById,
} from "../db/gem_keyword_tenders.js";
import { getAllGemKeywordTenderActivitiesByTenderId } from "../db/gem_keyword_tender_activities.js";
import { getAllGemKeywordTenderCommentsByTenderId } from "../db/gem_keyword_tender_comments.js";
import { getAllGemTenderScanRuns } from "../db/gem_tender_scan_runs.js";
import { buildGemKeywordTenderReport } from "../services/gem_keyword_tender_report.js";
import {
    GEM_KEYWORD_TENDER_ELIGIBILITY,
    GEM_KEYWORD_TENDER_ELIGIBILITY_LABELS,
    GEM_KEYWORD_TENDER_STAGE_LABELS,
    USER_LOGIN_METHOD_LABELS,
    USER_LOGIN_METHODS,
} from "../constants.js";
import { getAllAutomationUsers } from "../db/automation_users.js";
import {
    getAllContentPublishRuns,
    getContentPublishRunStatusCounts,
    getAllContentPublishRunTargets,
} from "../db/content_publish_runs.js";
import { processing as contentPublishProcessing } from "../libs/content_publish_browser.js";
import { decorateContentPublishRun } from "../services/content_publish.js";
import { getAllLinkedinDesignations } from "../db/linkedin_designations.js";
import { getAllLinkedinDesignationMessages } from "../db/linkedin_designation_messages.js";
import {
    getAllLinkedinGrowRunAccounts,
    getAllLinkedinGrowRunDesignations,
    getAllLinkedinGrowRuns,
} from "../db/linkedin_grow_runs.js";
import {
    getAllLinkedinSearchRunAccounts,
    getAllLinkedinSearchRunDesignations,
    getAllLinkedinSearchRuns,
} from "../db/linkedin_search_runs.js";
import {
    getAllLinkedinMessageRunAccounts,
    getAllLinkedinMessageRunDesignations,
    getAllLinkedinMessageRuns,
} from "../db/linkedin_message_runs.js";
import { processing as gemTendereProcessing } from "../libs/tenderer.js";
import { processing as linkedinProcessing } from "../libs/linkedin_browser.js";
import { getReadableDate, parseQueryDate } from "../libs/date.js";
import { formatContractCreatedOn } from "../libs/contractor.js";
import { isContractSigned } from "../services/contracts.js";

const { SERVICES } = CONSTANTS.SAAS;
const sharedAssetsDirectory = join(import.meta.dir, "../templates/assets");

async function getSharedAssetDataUri({ fileName, mimeType }) {
    const fileBytes = Buffer.from(
        await Bun.file(join(sharedAssetsDirectory, fileName)).arrayBuffer(),
    ).toString("base64");
    return `data:${mimeType};base64,${fileBytes}`;
}

export const uiRoutes = new Elysia()
    .get("/", ({ render }) => render("index"))
    .get("/products/your-institute", ({ render }) => render("products-your-institute"))
    .get("/robots.txt", () => Bun.file(join(import.meta.dir, "../public/robots.txt")))
    .get("/sitemap.xml", () => Bun.file(join(import.meta.dir, "../public/sitemap.xml")))
    .get("/llms.txt", () => Bun.file(join(import.meta.dir, "../public/llms.txt")))
    .get("/privacy", () => Bun.file(join(import.meta.dir, "../public/privacy.html")))
    .get("/data-deletion", () => Bun.file(join(import.meta.dir, "../public/data-deletion.html")))
    .get("/login", async ({ render, cookie, redirect }) => {
        if (await getCurrentUser({ cookie })) {
            return redirect("/app");
        }

        return render("login", {
            title: "Login — HammerByte",
        });
    })
    .get("/not-found", ({ render }) =>
        render("not_found", {
            title: "Not Found — HammerByte",
        }),
    )
    .get("/contracts/:signing_code/sign", async ({ params, render, redirect }) => {
        const contract = await getContractBySigningCode({
            signing_code: params.signing_code,
        });
        if (!contract) {
            return redirect("/not-found");
        }

        const contractClauses = await getContractClausesByContractId({
            contract_id: contract.id,
        });
        const clauseSubclauses = await getClauseSubclausesByContractId({
            contract_id: contract.id,
        });
        const requiredAttachments = await getContractRequiredAttachmentsByContractId({
            contract_id: contract.id,
        });
        const isSigned = isContractSigned(requiredAttachments);

        const contractorName =
            contract.full_name || contract.company || "";

        const selfieAttachment = requiredAttachments.find(
            (required) =>
                String(required.title || "").toLowerCase() === "selfie" && required.media_id,
        )?.media_id;
        const signatureAttachment = requiredAttachments.find(
            (required) =>
                String(required.title || "").toLowerCase() === "signature" && required.media_id,
        )?.media_id;

        return render("sign-contract", {
            title: `Contract — ${contractorName}`,
            header_image_src: await getSharedAssetDataUri({
                fileName: "header.png",
                mimeType: "image/png",
            }),
            stamp_image_src: await getSharedAssetDataUri({
                fileName: "stamp.png",
                mimeType: "image/png",
            }),
            signature_image_src: await getSharedAssetDataUri({
                fileName: "signature.png",
                mimeType: "image/png",
            }),
            footer_image_src: await getSharedAssetDataUri({
                fileName: "footer.png",
                mimeType: "image/png",
            }),
            is_signed: isSigned,
            required_attachments: requiredAttachments,
            contract: {
                contractor_name: contractorName,
                created_on: formatContractCreatedOn(contract.created_on),
                signing_code: contract.signing_code,
                selfie_src: selfieAttachment
                    ? `/api/contracts/media/${selfieAttachment}`
                    : null,
                signature_src: signatureAttachment
                    ? `/api/contracts/media/${signatureAttachment}`
                    : null,
            },
            clauses: contractClauses.map((contractClause) => ({
                ...contractClause,
                subclauses: clauseSubclauses.filter(
                    (clauseSubclause) => clauseSubclause.clause_id === contractClause.id,
                ),
            })),
        });
    })
    .guard({ beforeHandle: [requireSession] }, (app) =>
        app
            .derive(async ({ cookie }) => ({
                session: await getCurrentUser({ cookie }),
            }))
            .get("/app", ({ render, session }) =>
                render("app", appPage(session, {
                    title: "App — HammerByte",
                })),
            )
            .get("/app/applications", async ({ render, session }) =>
                render("applications", appPage(session, {
                    title: "Applications — HammerByte",
                    applications: await getAllProjectApplications(),
                })),
            )
            .get("/app/applications/:id", async ({ render, session, params, redirect }) => {
                const application = await getProjectApplicationById({ id: params.id });
                if (!application) {
                    return redirect("/not-found");
                }

                const linkedServices = await getAllApplicationServicesByApplicationId({
                    application_id: application.id,
                });
                const linkedServiceIds = new Set(
                    linkedServices.map((service) => service.service_id),
                );
                const availableServices = (await getAllServices()).filter(
                    (service) => !linkedServiceIds.has(service.id),
                );

                return render("application", appPage(session, {
                    title: `Application — ${application.title}`,
                    application,
                    customerProjects: await getAllCustomerProjects(),
                    services: linkedServices,
                    availableServices,
                }));
            })
            .get(
                "/app/application-services/:id",
                async ({ render, session, params, query, redirect }) => {
                    const applicationService = await getApplicationServiceById({
                        id: params.id,
                    });
                    if (!applicationService) {
                        return redirect("/not-found");
                    }

                    const application = await getProjectApplicationById({
                        id: applicationService.application_id,
                    });
                    if (!application) {
                        return redirect("/not-found");
                    }

                    const now = new Date();
                    const parsedMonth = Number(query.month);
                    const parsedYear = Number(query.year);
                    const month =
                        Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
                            ? parsedMonth
                            : now.getMonth() + 1;
                    const year =
                        Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
                            ? parsedYear
                            : now.getFullYear();

                    let usage = [];
                    let usageKind = null;
                    let totalSize = 0;

                    if (applicationService.title === SERVICES.MAILER) {
                        usageKind = SERVICES.MAILER;
                        usage = await getMailsByApplicationServiceId({
                            application_service_id: applicationService.id,
                            month,
                            year,
                        });
                    } else if (applicationService.title === SERVICES.BUCKETIZER) {
                        usageKind = SERVICES.BUCKETIZER;
                        await updateFileSizesByApplicationServiceId({
                            application_service_id: applicationService.id,
                        });
                        usage = await getFilesByApplicationServiceId({
                            application_service_id: applicationService.id,
                            month,
                            year,
                        });
                        totalSize = await getTotalFileSizeByApplicationServiceId({
                            application_service_id: applicationService.id,
                            month,
                            year,
                        });
                    }

                    return render("application-service", appPage(session, {
                        title: `Usage — ${applicationService.title}`,
                        application,
                        applicationService,
                        usage,
                        usageKind,
                        totalSize,
                        month,
                        year,
                    }));
                },
            )
            .get("/app/services", async ({ render, session }) =>
                render("services", appPage(session, {
                    title: "Services — HammerByte",
                    services: await getAllServices(),
                })),
            )
            .get("/app/projects", async ({ render, session }) =>
                render("projects", appPage(session, {
                    title: "Projects — HammerByte",
                    projects: await getAllCustomerProjects(),
                })),
            )
            .get("/app/projects/:id", async ({ render, session, params, query, redirect }) => {
                const customerProject = await getCustomerProjectById({
                    id: params.id,
                });
                if (!customerProject) {
                    return redirect("/not-found");
                }

                const customer = await getCustomerById({ id: customerProject.customer_id });
                if (!customer) {
                    return redirect("/not-found");
                }

                const now = new Date();
                const defaultStart = getReadableDate(
                    "YYYY-MM-DD",
                    new Date(now.getFullYear(), now.getMonth(), 1),
                );
                const defaultEnd = getReadableDate("YYYY-MM-DD", now);

                const start =
                    parseQueryDate(query.start) || defaultStart;
                const end =
                    parseQueryDate(query.end) || defaultEnd;

                const rangeStart = start <= end ? start : end;
                const rangeEnd = start <= end ? end : start;

                return render("project", appPage(session, {
                    title: `Project — ${customerProject.title}`,
                    customer,
                    customerProject,
                    applications: await getProjectApplicationsByProjectId({
                        project_id: customerProject.id,
                    }),
                    invoices: await getCustomerInvoicesByProjectId({
                        project_id: customerProject.id,
                        start: rangeStart,
                        end: rangeEnd,
                    }),
                    start: rangeStart,
                    end: rangeEnd,
                }));
            })
            .get("/app/project-documents/:projectId", async ({ render, session, params, redirect }) => {
                const customerProject = await getCustomerProjectById({
                    id: params.projectId,
                });
                if (!customerProject) {
                    return redirect("/not-found");
                }

                const customer = await getCustomerById({ id: customerProject.customer_id });
                if (!customer) {
                    return redirect("/not-found");
                }

                return render("project-documents", appPage(session, {
                    title: `Documents — ${customerProject.title}`,
                    customer,
                    customerProject,
                    documents: await getProjectDocumentsByProjectId({
                        project_id: customerProject.id,
                    }),
                }));
            })
            .get("/app/internal-documents", async ({ render, session }) =>
                render("internal-documents", appPage(session, {
                    title: "Internal Documents — HammerByte",
                    documents: await getAllInternalDocuments(),
                })),
            )
            .get("/app/servers", async ({ render, session }) =>
                render("servers", appPage(session, {
                    title: "Servers — HammerByte",
                    servers: await getAllServers(),
                    projects: await getAllCustomerProjects(),
                })),
            )
            .get("/app/servers/:id", async ({ render, session, params, redirect }) => {
                const server = await getServerById({ id: Number(params.id) });
                if (!server) {
                    return redirect("/not-found");
                }
                const metricRows = await getServerMetricsByServerId({ server_id: server.id });
                const metrics = (metricRows || []).map((metric) => {
                    let data = null;
                    try {
                        data =
                            typeof metric.payload === "string"
                                ? JSON.parse(metric.payload)
                                : metric.payload && typeof metric.payload === "object"
                                  ? metric.payload
                                  : null;
                    } catch {
                        data = null;
                    }
                    return {
                        id: metric.id,
                        collected_at: metric.collected_at,
                        data,
                        raw:
                            typeof metric.payload === "string"
                                ? metric.payload
                                : JSON.stringify(metric.payload ?? {}, null, 2),
                    };
                });
                return render("server", appPage(session, {
                    title: `${server.name || server.tag} — Servers — HammerByte`,
                    server,
                    metrics,
                    latest: metrics[0] || null,
                }));
            })
            .get("/app/expenses", async ({ render, session, query }) => {
                const now = new Date();
                const defaultStart = getReadableDate(
                    "YYYY-MM-DD",
                    new Date(now.getFullYear(), now.getMonth(), 1),
                );
                const defaultEnd = getReadableDate("YYYY-MM-DD", now);

                const start =
                    parseQueryDate(query.start) || defaultStart;
                const end =
                    parseQueryDate(query.end) || defaultEnd;

                const rangeStart = start <= end ? start : end;
                const rangeEnd = start <= end ? end : start;
                const expenses = await getExpensesByDateRange({
                    start: rangeStart,
                    end: rangeEnd,
                });
                let nonLoanedAmount = 0;
                let loanedAmount = 0;
                for (const expense of expenses) {
                    const amount = Number(expense.amount || 0);
                    if (expense.loaned) {
                        loanedAmount += amount;
                    } else {
                        nonLoanedAmount += amount;
                    }
                }

                return render("expenses", appPage(session, {
                    title: "Expenses — HammerByte",
                    expenses,
                    start: rangeStart,
                    end: rangeEnd,
                    nonLoanedAmount,
                    loanedAmount,
                    itemCount: expenses.length,
                }));
            })
            .get("/app/revenue", async ({ render, session, query }) => {
                const now = new Date();
                const defaultStart = getReadableDate(
                    "YYYY-MM-DD",
                    new Date(now.getFullYear(), now.getMonth(), 1),
                );
                const defaultEnd = getReadableDate("YYYY-MM-DD", now);

                const start =
                    parseQueryDate(query.start) || defaultStart;
                const end =
                    parseQueryDate(query.end) || defaultEnd;

                const rangeStart = start <= end ? start : end;
                const rangeEnd = start <= end ? end : start;

                const payments = await getInvoicePaymentsByCreatedOnRange({
                    start: rangeStart,
                    end: rangeEnd,
                });
                const expenses = await getExpensesByCreatedOnRange({
                    start: rangeStart,
                    end: rangeEnd,
                });
                const paymentsTotal = payments.reduce(
                    (sum, row) => sum + Number(row.amount || 0) + Number(row.gst || 0),
                    0,
                );
                const expensesTotal = expenses.reduce(
                    (sum, expense) => sum + Number(expense.amount || 0),
                    0,
                );
                const loanedAmount = expenses.reduce(
                    (sum, expense) =>
                        expense.loaned ? sum + Number(expense.amount || 0) : sum,
                    0,
                );

                return render("revenue", appPage(session, {
                    title: "Revenue — HammerByte",
                    payments,
                    expenses,
                    start: rangeStart,
                    end: rangeEnd,
                    paymentsTotal,
                    expensesTotal,
                    loanedAmount,
                    net: paymentsTotal - expensesTotal,
                }));
            })
            .get("/app/customers", async ({ render, session }) =>
                render("customers", appPage(session, {
                    title: "Customers — HammerByte",
                    customers: await getAllCustomers(),
                })),
            )
            .get("/app/customers/:id", async ({ render, session, params, redirect }) => {
                const customer = await getCustomerById({ id: params.id });
                if (!customer) {
                    return redirect("/not-found");
                }

                const customerPhones = await getCustomerPhonesByCustomerId({
                    customer_id: customer.id,
                });
                const customerEmails = await getCustomerEmailsByCustomerId({
                    customer_id: customer.id,
                });
                const customerProjects = await getCustomerProjectsByCustomerId({
                    customer_id: customer.id,
                });

                return render("customer", appPage(session, {
                    title: `Customer — ${customer.full_name}`,
                    customer,
                    customerPhones,
                    customerEmails,
                    customerProjects,
                }));
            })
            .get("/app/invoices", async ({ render, session }) =>
                render("invoices", appPage(session, {
                    title: "Invoices — HammerByte",
                    invoices: await getAllCustomerInvoices(),
                    customers: await getAllCustomers(),
                    customerProjects: await getAllCustomerProjects(),
                })),
            )
            .get("/app/invoices/:id", async ({ render, session, params, redirect }) => {
                const invoice = await getCustomerInvoiceById({ id: params.id });
                if (!invoice) {
                    return redirect("/not-found");
                }

                const invoicePage = appPage(session, {
                    invoice,
                    items: await getInvoiceItemsByCustomerInvoiceId({
                        customer_invoice_id: invoice.id,
                    }),
                    payments: await getInvoicePaymentsByCustomerInvoiceId({
                        customer_invoice_id: invoice.id,
                    }),
                    customerEmails: await getCustomerEmailsByCustomerId({
                        customer_id: invoice.customer_id,
                    }),
                });

                return render("invoice", {
                    ...invoicePage,
                    title: `Invoice ${invoicePage.resolveInvoiceNumber({
                        hbt_sequence: invoice.hbt_sequence,
                        id: invoice.id,
                    })}`,
                });
            })
            .get("/app/inquiries", async ({ render, session }) =>
                render("inquiries", appPage(session, {
                    title: "Inquiries — HammerByte",
                    inquiries: await getAllInquiries(),
                })),
            )
            .get("/app/contracts", async ({ render, session }) =>
                render("contracts", appPage(session, {
                    title: "Contracts — HammerByte",
                    contracts: await getAllContracts(),
                    attachments: await getAllContractAttachments(),
                })),
            )
            .get("/app/contracts/:id", async ({ render, session, params, redirect }) => {
                const contract = await getContractById({ id: params.id });
                if (!contract) {
                    return redirect("/not-found");
                }

                const clauses = await getContractClausesByContractId({
                    contract_id: contract.id,
                });
                const subclauses = await getClauseSubclausesByContractId({
                    contract_id: contract.id,
                });
                const requiredAttachments = await getContractRequiredAttachmentsByContractId({
                    contract_id: contract.id,
                });

                return render("contract", appPage(session, {
                    title: `Contract #${contract.id} — HammerByte`,
                    contract,
                    attachments: await getAllContractAttachments(),
                    required_attachments: requiredAttachments,
                    is_signed: isContractSigned(requiredAttachments),
                    clauses: clauses.map((clause) => ({
                        ...clause,
                        subclauses: subclauses.filter(
                            (subclause) => subclause.clause_id === clause.id,
                        ),
                    })),
                }));
            })
            .get("/app/users", async ({ render, session }) =>
                render("users", appPage(session, {
                    title: "Users — HammerByte",
                    users: await getAllUsers(),
                    allRoles: await getAllRoles(),
                    USER_LOGIN_METHODS,
                    USER_LOGIN_METHOD_LABELS,
                })),
            )
            .get("/app/roles", async ({ render, session }) =>
                render("roles", appPage(session, {
                    title: "Roles — HammerByte",
                    allRoles: await getAllRoles(),
                    allAuthorities: await getAllAuthorities(),
                })),
            )
            .get("/app/authorities", async ({ render, session }) =>
                render("authorities", appPage(session, {
                    title: "Authorities — HammerByte",
                    allAuthorities: await getAllAuthorities(),
                })),
            )
            .get("/app/gem-tenders", ({ render, session }) =>
                render("gem-tenders-hub", appPage(session, {
                    title: "Gem Tenders Analyzer — HammerByte",
                })),
            )
            .get("/app/gem-tender-keywords", async ({ render, session }) =>
                render("gem-tenders", appPage(session, {
                    title: "Keywords — Gem Tenders Analyzer — HammerByte",
                    keywords: await getAllGemTenderKeywords(),
                    processing: gemTendereProcessing,
                })),
            )
            .get("/app/gem-tender-scan-history", async ({ render, session }) =>
                render("gem-tender-scan-history", appPage(session, {
                    title: "Scan History — Gem Tenders Analyzer — HammerByte",
                    runs: await getAllGemTenderScanRuns(),
                })),
            )
            .get("/app/gem-keyword-tenders", async ({ render, session, query }) => {
                const now = new Date();
                const defaultTo = getReadableDate("YYYY-MM-DD", now);
                const defaultFrom = getReadableDate(
                    "YYYY-MM-DD",
                    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30),
                );

                const from =
                    parseQueryDate(query.from) || defaultFrom;
                const to =
                    parseQueryDate(query.to) || defaultTo;

                const rangeFrom = from <= to ? from : to;
                const rangeTo = from <= to ? to : from;

                return render("gem-keyword-tenders", appPage(session, {
                    title: "Tenders — Gem Tenders Analyzer — HammerByte",
                    from: rangeFrom,
                    to: rangeTo,
                    keywords: await getAllGemTenderKeywords(),
                    users: await getAllUsers(),
                    tenders: await getAllGemKeywordTenders({
                        from: rangeFrom,
                        to: rangeTo,
                    }),
                    GEM_KEYWORD_TENDER_STAGE_LABELS,
                    GEM_KEYWORD_TENDER_ELIGIBILITY,
                    GEM_KEYWORD_TENDER_ELIGIBILITY_LABELS,
                }));
            })
            .get("/app/gem-keyword-tender-report", async ({ render, session, query }) => {
                const now = new Date();
                const defaultTo = getReadableDate("YYYY-MM-DD", now);
                const defaultFrom = getReadableDate(
                    "YYYY-MM-DD",
                    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30),
                );

                const from =
                    parseQueryDate(query.from) || defaultFrom;
                const to =
                    parseQueryDate(query.to) || defaultTo;

                const rangeFrom = from <= to ? from : to;
                const rangeTo = from <= to ? to : from;
                const report = await buildGemKeywordTenderReport({
                    from: rangeFrom,
                    to: rangeTo,
                });

                return render("gem-keyword-tender-report", appPage(session, {
                    title: "Tenders report — Gem Tenders Analyzer — HammerByte",
                    from: rangeFrom,
                    to: rangeTo,
                    report,
                }));
            })
            .get(
                "/app/gem-keyword-tenders/:id",
                async ({ render, session, params, redirect }) => {
                    const tender = await getGemKeywordTenderById({ id: params.id });
                    if (!tender) {
                        return redirect("/not-found");
                    }

                    return render("gem-keyword-tender", appPage(session, {
                        title: `Tender ${tender.tender_id} — HammerByte`,
                        tender,
                        userId: session?.id,
                        users: await getAllUsers(),
                        activities: await getAllGemKeywordTenderActivitiesByTenderId({
                            gem_keyword_tender_id: tender.id,
                        }),
                        comments: await getAllGemKeywordTenderCommentsByTenderId({
                            gem_keyword_tender_id: tender.id,
                        }),
                        GEM_KEYWORD_TENDER_STAGE_LABELS,
                        GEM_KEYWORD_TENDER_ELIGIBILITY,
                        GEM_KEYWORD_TENDER_ELIGIBILITY_LABELS,
                    }));
                },
            )
            .get("/app/automation", ({ render, session }) =>
                render("automation", appPage(session, {
                    title: "Automation — HammerByte",
                })),
            )
            .get("/app/automation-users", async ({ render, session }) =>
                render("automation-users", appPage(session, {
                    title: "Automation Users — HammerByte",
                    automationUsers: await getAllAutomationUsers(),
                })),
            )
            .get("/app/content-publish", ({ render, session }) =>
                render("content-publish", appPage(session, {
                    title: "Content Publishing — HammerByte",
                })),
            )
            .get("/app/content-publish-image", async ({ render, session }) =>
                render("content-publish-start", appPage(session, {
                    title: "Publish Image — HammerByte",
                    automationUsers: await getAllAutomationUsers(),
                })),
            )
            .get("/app/content-publish-video", async ({ render, session }) =>
                render("content-publish-video-start", appPage(session, {
                    title: "Publish Video — HammerByte",
                    automationUsers: await getAllAutomationUsers(),
                })),
            )
            .get("/app/content-publish-video-start", ({ redirect }) =>
                redirect("/app/content-publish-video"),
            )
            .get("/app/content-publish-start", ({ redirect }) =>
                redirect("/app/content-publish-image"),
            )

            .get("/app/content-publish-history", async ({ render, session }) => {
                const publishRuns = await getAllContentPublishRuns();
                const publishTargets = await getAllContentPublishRunTargets();
                const queue = await getContentPublishRunStatusCounts();
                const targetsByRunId = new Map();
                for (const target of publishTargets) {
                    const list = targetsByRunId.get(target.run_id) || [];
                    list.push(target);
                    targetsByRunId.set(target.run_id, list);
                }
                const runs = publishRuns.map((run) => ({
                    ...decorateContentPublishRun(run),
                    targets: targetsByRunId.get(run.id) || [],
                }));
                return render("content-publish-history", appPage(session, {
                    title: "Publish History — HammerByte",
                    runs,
                    queue,
                    processing: contentPublishProcessing,
                }));
            })
            .get("/app/linkedin", ({ render, session }) =>
                render("linkedin", appPage(session, {
                    title: "LinkedIn — HammerByte",
                })),
            )
            .get("/app/linkedin-grow-network", async ({ render, session }) =>
                render("linkedin-grow-network", appPage(session, {
                    title: "GrowNetwork — HammerByte",
                    designations: await getAllLinkedinDesignations(),
                    linkedinUsers: (await getAllAutomationUsers()).filter((user) =>
                        String(user.linkedin_cookie || "").trim(),
                    ),
                    processing: linkedinProcessing,
                })),
            )
            .get("/app/linkedin-designations", async ({ render, session }) =>
                render("linkedin-designations", appPage(session, {
                    title: "LinkedIn Designations — HammerByte",
                    designations: await getAllLinkedinDesignations(),
                })),
            )
            .get("/app/linkedin-grow-network-history", async ({ render, session }) => {
                const growRuns = await getAllLinkedinGrowRuns();
                const growRunAccounts = await getAllLinkedinGrowRunAccounts();
                const growRunDesignations = await getAllLinkedinGrowRunDesignations();

                const accountsByRunId = new Map();
                for (const growRunAccount of growRunAccounts) {
                    const list = accountsByRunId.get(growRunAccount.run_id) || [];
                    list.push(growRunAccount);
                    accountsByRunId.set(growRunAccount.run_id, list);
                }

                const designationsByRunId = new Map();
                for (const growRunDesignation of growRunDesignations) {
                    const list = designationsByRunId.get(growRunDesignation.run_id) || [];
                    list.push(growRunDesignation);
                    designationsByRunId.set(growRunDesignation.run_id, list);
                }

                const runs = growRuns.map((growRun) => ({
                    ...growRun,
                    accounts: accountsByRunId.get(growRun.id) || [],
                    designations: designationsByRunId.get(growRun.id) || [],
                }));

                return render("linkedin-grow-network-history", appPage(session, {
                    title: "GrowNetwork History — HammerByte",
                    runs,
                }));
            })
            .get("/app/linkedin-search-network", async ({ render, session }) =>
                render("linkedin-search-network", appPage(session, {
                    title: "SearchNetwork — HammerByte",
                    designations: await getAllLinkedinDesignations(),
                    linkedinUsers: (await getAllAutomationUsers()).filter((user) =>
                        String(user.linkedin_cookie || "").trim(),
                    ),
                    processing: linkedinProcessing,
                })),
            )
            .get("/app/linkedin-search-network-history", async ({ render, session }) => {
                const searchRuns = await getAllLinkedinSearchRuns();
                const searchRunAccounts = await getAllLinkedinSearchRunAccounts();
                const searchRunDesignations = await getAllLinkedinSearchRunDesignations();

                const accountsByRunId = new Map();
                for (const searchRunAccount of searchRunAccounts) {
                    const list = accountsByRunId.get(searchRunAccount.run_id) || [];
                    list.push(searchRunAccount);
                    accountsByRunId.set(searchRunAccount.run_id, list);
                }

                const designationsByRunId = new Map();
                for (const searchRunDesignation of searchRunDesignations) {
                    const list = designationsByRunId.get(searchRunDesignation.run_id) || [];
                    list.push(searchRunDesignation);
                    designationsByRunId.set(searchRunDesignation.run_id, list);
                }

                const runs = searchRuns.map((searchRun) => ({
                    ...searchRun,
                    accounts: accountsByRunId.get(searchRun.id) || [],
                    designations: designationsByRunId.get(searchRun.id) || [],
                }));

                return render("linkedin-search-network-history", appPage(session, {
                    title: "SearchNetwork History — HammerByte",
                    runs,
                }));
            })
            .get("/app/linkedin-messages", async ({ render, session }) =>
                render("linkedin-messages", appPage(session, {
                    title: "LinkedIn Messages — HammerByte",
                    designations: await getAllLinkedinDesignations(),
                    messages: await getAllLinkedinDesignationMessages(),
                })),
            )
            .get("/app/linkedin-message-network", async ({ render, session }) => {
                const designations = await getAllLinkedinDesignations();
                const messages = await getAllLinkedinDesignationMessages();
                const messageCounts = {};
                for (const row of messages) {
                    messageCounts[row.designation_id] = (messageCounts[row.designation_id] || 0) + 1;
                }

                return render("linkedin-message-network", appPage(session, {
                    title: "MessageNetwork — HammerByte",
                    designations,
                    linkedinUsers: (await getAllAutomationUsers()).filter((user) =>
                        String(user.linkedin_cookie || "").trim(),
                    ),
                    messageCounts,
                    processing: linkedinProcessing,
                }));
            })
            .get("/app/linkedin-message-network-history", async ({ render, session }) => {
                const messageRuns = await getAllLinkedinMessageRuns();
                const messageRunAccounts = await getAllLinkedinMessageRunAccounts();
                const messageRunDesignations = await getAllLinkedinMessageRunDesignations();

                const accountsByRunId = new Map();
                for (const messageRunAccount of messageRunAccounts) {
                    const list = accountsByRunId.get(messageRunAccount.run_id) || [];
                    list.push(messageRunAccount);
                    accountsByRunId.set(messageRunAccount.run_id, list);
                }

                const designationsByRunId = new Map();
                for (const messageRunDesignation of messageRunDesignations) {
                    const list = designationsByRunId.get(messageRunDesignation.run_id) || [];
                    list.push(messageRunDesignation);
                    designationsByRunId.set(messageRunDesignation.run_id, list);
                }

                const runs = messageRuns.map((messageRun) => ({
                    ...messageRun,
                    accounts: accountsByRunId.get(messageRun.id) || [],
                    designations: designationsByRunId.get(messageRun.id) || [],
                }));

                return render("linkedin-message-network-history", appPage(session, {
                    title: "MessageNetwork History — HammerByte",
                    runs,
                }));
            }),
    );
