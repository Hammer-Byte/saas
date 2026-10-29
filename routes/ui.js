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
import { getAllGemTenderKeywords, getGemTenderKeywordById } from "../db/gem_tender_keywords.js";
import { getGemKeywordTendersByKeywordId } from "../db/gem_keyword_tenders.js";
import { getAllLinkedinUsers } from "../db/linkedin_users.js";
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
import { getReadableDate } from "../libs/date.js";
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
                    query.start && /^\d{4}-\d{2}-\d{2}$/.test(query.start)
                        ? query.start
                        : defaultStart;
                const end =
                    query.end && /^\d{4}-\d{2}-\d{2}$/.test(query.end)
                        ? query.end
                        : defaultEnd;

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
            .get("/app/expenses", async ({ render, session, query }) => {
                const now = new Date();
                const defaultStart = getReadableDate(
                    "YYYY-MM-DD",
                    new Date(now.getFullYear(), now.getMonth(), 1),
                );
                const defaultEnd = getReadableDate("YYYY-MM-DD", now);

                const start =
                    query.start && /^\d{4}-\d{2}-\d{2}$/.test(query.start)
                        ? query.start
                        : defaultStart;
                const end =
                    query.end && /^\d{4}-\d{2}-\d{2}$/.test(query.end)
                        ? query.end
                        : defaultEnd;

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
                    query.start && /^\d{4}-\d{2}-\d{2}$/.test(query.start)
                        ? query.start
                        : defaultStart;
                const end =
                    query.end && /^\d{4}-\d{2}-\d{2}$/.test(query.end)
                        ? query.end
                        : defaultEnd;

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
            .get("/app/gem-tender-keywords", async ({ render, session }) =>
                render("gem-tenders", appPage(session, {
                    title: "Gem Tenders Analyzer — HammerByte",
                    keywords: await getAllGemTenderKeywords(),
                    processing: gemTendereProcessing,
                    month: getReadableDate("YYYY-MM", new Date()),
                })),
            )
            .get(
                "/app/gem-tender-keywords/:id",
                async ({ render, session, params, query, redirect }) => {
                    const keyword = await getGemTenderKeywordById({ id: params.id });
                    if (!keyword) {
                        return redirect("/not-found");
                    }

                    const month =
                        query.month && /^\d{4}-\d{2}$/.test(query.month)
                            ? query.month
                            : getReadableDate("YYYY-MM", new Date());

                    return render("gem-tender-keyword", appPage(session, {
                        title: `Tenders — ${keyword.keyword} — HammerByte`,
                        keyword,
                        month,
                        tenders: await getGemKeywordTendersByKeywordId({
                            keyword_id: keyword.id,
                            month,
                        }),
                    }));
                },
            )
            .get("/app/linkedin", ({ render, session }) =>
                render("linkedin", appPage(session, {
                    title: "LinkedIn — HammerByte",
                })),
            )
            .get("/app/linkedin-users", async ({ render, session }) =>
                render("linkedin-users", appPage(session, {
                    title: "LinkedIn Users — HammerByte",
                    linkedinUsers: await getAllLinkedinUsers(),
                })),
            )
            .get("/app/linkedin-grow-network", async ({ render, session }) =>
                render("linkedin-grow-network", appPage(session, {
                    title: "GrowNetwork — HammerByte",
                    designations: await getAllLinkedinDesignations(),
                    linkedinUsers: await getAllLinkedinUsers(),
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
                    linkedinUsers: await getAllLinkedinUsers(),
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
                    linkedinUsers: await getAllLinkedinUsers(),
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
