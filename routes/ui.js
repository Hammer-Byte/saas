import { join } from "node:path";
import { Elysia } from "elysia";
import { CONSTANTS } from "@hammerbyte/utils";
import requireSession from "../middlewares/require_session.js";
import { getCurrentUser } from "../services/authentication.js";
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
import { processing as gemTendereProcessing } from "../libs/tenderer.js";
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
                render("app", {
                    title: "App — HammerByte",
                    username: session?.username,
                }),
            )
            .get("/app/applications", async ({ render, session }) =>
                render("applications", {
                    title: "Applications — HammerByte",
                    username: session?.username,
                    applications: await getAllProjectApplications(),
                }),
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

                return render("application", {
                    title: `Application — ${application.title}`,
                    username: session?.username,
                    application,
                    customerProjects: await getAllCustomerProjects(),
                    services: linkedServices,
                    availableServices,
                });
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

                    return render("application-service", {
                        title: `Usage — ${applicationService.title}`,
                        username: session?.username,
                        application,
                        applicationService,
                        usage,
                        usageKind,
                        totalSize,
                        month,
                        year,
                    });
                },
            )
            .get("/app/services", async ({ render, session }) =>
                render("services", {
                    title: "Services — HammerByte",
                    username: session?.username,
                    services: await getAllServices(),
                }),
            )
            .get("/app/projects", async ({ render, session }) =>
                render("projects", {
                    title: "Projects — HammerByte",
                    username: session?.username,
                    projects: await getAllCustomerProjects(),
                }),
            )
            .get("/app/projects/:id", async ({ render, session, params, redirect }) => {
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

                return render("project", {
                    title: `Project — ${customerProject.title}`,
                    username: session?.username,
                    customer,
                    customerProject,
                    applications: await getProjectApplicationsByProjectId({
                        project_id: customerProject.id,
                    }),
                    invoices: await getCustomerInvoicesByProjectId({
                        project_id: customerProject.id,
                    }),
                });
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

                return render("project-documents", {
                    title: `Documents — ${customerProject.title}`,
                    username: session?.username,
                    customer,
                    customerProject,
                    documents: await getProjectDocumentsByProjectId({
                        project_id: customerProject.id,
                    }),
                });
            })
            .get("/app/internal-documents", async ({ render, session }) =>
                render("internal-documents", {
                    title: "Internal Documents — HammerByte",
                    username: session?.username,
                    documents: await getAllInternalDocuments(),
                }),
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

                return render("expenses", {
                    title: "Expenses — HammerByte",
                    username: session?.username,
                    expenses,
                    start: rangeStart,
                    end: rangeEnd,
                    nonLoanedAmount,
                    loanedAmount,
                    itemCount: expenses.length,
                });
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

                return render("revenue", {
                    title: "Revenue — HammerByte",
                    username: session?.username,
                    payments,
                    expenses,
                    start: rangeStart,
                    end: rangeEnd,
                    paymentsTotal,
                    expensesTotal,
                    net: paymentsTotal - expensesTotal,
                });
            })
            .get("/app/customers", async ({ render, session }) =>
                render("customers", {
                    title: "Customers — HammerByte",
                    username: session?.username,
                    customers: await getAllCustomers(),
                }),
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

                return render("customer", {
                    title: `Customer — ${customer.full_name}`,
                    username: session?.username,
                    customer,
                    customerPhones,
                    customerEmails,
                    customerProjects,
                });
            })
            .get("/app/invoices", async ({ render, session }) =>
                render("invoices", {
                    title: "Invoices — HammerByte",
                    username: session?.username,
                    invoices: await getAllCustomerInvoices(),
                    customers: await getAllCustomers(),
                    customerProjects: await getAllCustomerProjects(),
                }),
            )
            .get("/app/invoices/:id", async ({ render, session, params, redirect }) => {
                const invoice = await getCustomerInvoiceById({ id: params.id });
                if (!invoice) {
                    return redirect("/not-found");
                }

                return render("invoice", {
                    title: `Invoice #${invoice.id}`,
                    username: session?.username,
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
            })
            .get("/app/inquiries", async ({ render, session }) =>
                render("inquiries", {
                    title: "Inquiries — HammerByte",
                    username: session?.username,
                    inquiries: await getAllInquiries(),
                }),
            )
            .get("/app/contracts", async ({ render, session }) =>
                render("contracts", {
                    title: "Contracts — HammerByte",
                    username: session?.username,
                    contracts: await getAllContracts(),
                    attachments: await getAllContractAttachments(),
                }),
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

                return render("contract", {
                    title: `Contract #${contract.id} — HammerByte`,
                    username: session?.username,
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
                });
            })
            .get("/app/users", async ({ render, session }) =>
                render("users", {
                    title: "Users — HammerByte",
                    username: session?.username,
                    users: await getAllUsers(),
                }),
            )
            .get("/app/gem-tender-keywords", async ({ render, session }) =>
                render("gem-tenders", {
                    title: "Gem Tenders Analyzer — HammerByte",
                    username: session?.username,
                    keywords: await getAllGemTenderKeywords(),
                    processing: gemTendereProcessing,
                    month: getReadableDate("YYYY-MM", new Date()),
                }),
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

                    return render("gem-tender-keyword", {
                        title: `Tenders — ${keyword.keyword} — HammerByte`,
                        username: session?.username,
                        keyword,
                        month,
                        tenders: await getGemKeywordTendersByKeywordId({
                            keyword_id: keyword.id,
                            month,
                        }),
                    });
                },
            ),
    );
