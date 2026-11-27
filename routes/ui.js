import { join } from "node:path";
import { Elysia } from "elysia";
import { CONSTANTS } from "@hammerbyte/utils";
import requireSession from "../middlewares/require_session.js";
import { getCurrentUser } from "../services/authentication.js";
import { appPage } from "../libs/app_page.js";
import { getAllRoles, getRoleById } from "../db/roles.js";
import { getRoleAuthoritiesByRoleId } from "../db/role_authorities.js";
import { getAllAuthorities } from "../db/authorities.js";
import {
    getAllProjectApplications,
    getProjectApplicationById,
    getProjectApplicationsByProjectId,
} from "../db/project_applications.js";
import { getAllServices, getServiceById } from "../db/services.js";
import { getAllApplicationServicesByApplicationId, getApplicationServiceById } from "../db/application_services.js";
import { getAllInquiries, getInquiryById } from "../db/inquiries.js";
import { getAllInquiryActivitiesByInquiryId } from "../db/inquiry_activities.js";
import { getAllInquiryFollowupsByInquiryId } from "../db/inquiry_followups.js";
import { getAllInquiryNotesByInquiryId } from "../db/inquiry_notes.js";
import { buildInquiryReport } from "../services/inquiry_report.js";
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
import { getAllInternalDocuments, getInternalDocumentById } from "../db/internal_documents.js";
import { getAllGemDocuments } from "../db/gem_documents.js";
import { getAllServers, getServerById } from "../db/servers.js";
import { buildServerPageData } from "../libs/server_pages.js";
import { getExpenseById, getExpensesByCreatedOnRange, getExpensesByDateRange } from "../db/expenses.js";
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
import { getAllUsers, getUserByEmail, getUserById } from "../db/users.js";
import { getAllContracts, getContractById, getContractBySigningCode } from "../db/contracts.js";
import { getContractClausesByContractId } from "../db/contract_clauses.js";
import { getClauseSubclausesByContractId } from "../db/clause_subclauses.js";
import { getAllContractAttachments } from "../db/contract_attachments.js";
import { getContractRequiredAttachmentsByContractId } from "../db/contract_required_attachments.js";
import { getAllGemCategoryGroups } from "../db/gem_category_groups.js";
import { getAllGemCategories } from "../db/gem_categories.js";
import { getAllGemScanKeywords } from "../db/gem_scan_keywords.js";
import { getAllGemTenderCategories } from "../db/gem_tender_categories.js";
import { canUseGemCategories } from "../services/gem_categories.js";
import { getAllGemTenderScanRuns } from "../db/gem_tender_scan_runs.js";
import { GEM_TENDER_SCAN_TYPE_LABELS } from "../constants.js";
import {
    getAllGemTenders,
    getGemTenderById,
} from "../db/gem_tenders.js";
import { getAllGemTenderActivitiesByTenderId } from "../db/gem_tender_activities.js";
import { getAllGemTenderCommentsByTenderId } from "../db/gem_tender_comments.js";
import { getAllGemTenderDocumentsByTenderId } from "../db/gem_tender_documents.js";
import { buildGemTenderReport } from "../services/gem_tender_report.js";
import { canManageTenderDocuments } from "../services/gem_tender_documents.js";
import { relockStateOf } from "../services/gem_tenders.js";
import { canManageInternalDocuments } from "../services/internal_documents.js";
import {
    canManageGemDocuments,
    canUseGemSection,
} from "../services/gem_documents.js";
import { canUseJobs } from "../services/jobs.js";
import { canUseServers } from "../services/servers.js";
import { canUseCrm } from "../services/crm.js";
import { getAllLeads } from "../db/leads.js";
import { getLeadDetail } from "../services/leads.js";
import { getAllLeadNotesByLeadId } from "../db/lead_notes.js";
import { getLeadCommunicationsByLeadId } from "../db/lead_communications.js";
import { getAllConsultationTopics } from "../db/consultation_topics.js";
import { getAllConsultationSlots } from "../db/consultation_slots.js";
import { getAllConsultationBookings } from "../db/consultation_bookings.js";
import { getConsultationSettings } from "../db/consultation_settings.js";
import {
    getActiveJobPositions,
    getAllJobPositions,
    getJobPositionById,
} from "../db/job_positions.js";
import {
    getJobApplicantById,
    getJobApplicantsByJobPositionId,
} from "../db/job_applicants.js";
import { getJobApplicantInterviewsByApplicantId } from "../db/job_applicant_interviews.js";
import { getMaxRequestBodySize } from "../libs/upload_limits.js";
import {
    CONTRACT_BROKEN_BY,
    CONTRACT_BROKEN_BY_LABELS,
    GEM_TENDER_ELIGIBILITY_CHOICE_LABELS,
    GEM_TENDER_FILING_MIN_DOCUMENTS,
    GEM_TENDER_PIPELINE_STAGES,
    GEM_TENDER_STAGE_LABELS,
    GEM_TENDER_LOCK_MESSAGES,
    INQUIRY_FOLLOWUP_DAY_OFFSETS,
    INQUIRY_SOURCE_LABELS,
    INQUIRY_STATE_LABELS,
    CONSULTATION_STATUSES,
    CONSULTATION_STATUS_LABELS,
    LEAD_COMMUNICATION_CHANNELS,
    LEAD_COMMUNICATION_CHANNEL_LABELS,
    LEAD_EMAIL_KINDS,
    LEAD_EMAIL_KIND_LABELS,
    TASK_PRIORITIES,
    TASK_PRIORITY_LABELS,
    TASK_STATE_LABELS,
    TASK_STATES,
    USER_LOGIN_EMAIL_LABELS,
    USER_LOGIN_EMAILS,
    USER_LOGIN_METHOD_LABELS,
    USER_LOGIN_METHODS,
} from "../constants.js";
import { getAllTasks, getTaskById, getTasksByProjectId } from "../db/tasks.js";
import { getAllTaskActivitiesByTaskId } from "../db/task_activities.js";
import { getAllTaskAttachmentsByTaskId } from "../db/task_attachments.js";
import { getAllTaskCommentsByTaskId } from "../db/task_comments.js";
import { buildSprintBurnReport, buildTaskReport } from "../services/task_report.js";
import {
    addIstCalendarDays,
    buildSprintWeekOptions,
    getIstDate,
    getIstMonthBounds,
    getMondayDate,
    getSundayDate,
    parseQueryDate,
} from "../libs/date.js";

function defaultDateRangeDays({ daysAhead = 7 } = {}) {
    const todayIst = getIstDate();
    if (!todayIst) {
        return { from: null, to: null };
    }
    return {
        from: todayIst,
        to: addIstCalendarDays(todayIst, daysAhead) || todayIst,
    };
}

function defaultDateRangeLookingBack({ daysBack = 30 } = {}) {
    const todayIst = getIstDate();
    if (!todayIst) {
        return { from: null, to: null };
    }
    return {
        from: addIstCalendarDays(todayIst, -Math.abs(daysBack)) || todayIst,
        to: todayIst,
    };
}
import { formatContractCreatedOn } from "../libs/contractor.js";
import { isContractSigned } from "../services/contracts.js";
import { listEntityComments } from "../services/entity_comments.js";

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
    .get("/consultation", ({ render }) =>
        render("consultation", {
            title: "Free Consultation — HammerByte",
        }),
    )
    .get("/careers", async ({ render }) =>
        render("careers", {
            title: "Careers — HammerByte",
            jobs: await getActiveJobPositions(),
        }),
    )
    .get("/careers/:id/apply", async ({ render, params, redirect }) => {
        const job = await getJobPositionById({ id: Number(params.id) });
        if (!job || !job.active) {
            return redirect("/not-found");
        }
        return render("career-apply", {
            title: `Apply — ${job.title} — HammerByte`,
            job,
            maxRequestBodySize: getMaxRequestBodySize(),
        });
    })
    .get("/careers/:id", async ({ render, params, redirect }) => {
        const job = await getJobPositionById({ id: Number(params.id) });
        if (!job || !job.active) {
            return redirect("/not-found");
        }
        return render("career", {
            title: `${job.title} — Careers — HammerByte`,
            job,
        });
    })
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
            maxRequestBodySize: getMaxRequestBodySize(),
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

                    const todayIst = getIstDate() || "";
                    const parsedMonth = Number(query.month);
                    const parsedYear = Number(query.year);
                    const month =
                        Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
                            ? parsedMonth
                            : Number(todayIst.slice(5, 7)) || 1;
                    const year =
                        Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
                            ? parsedYear
                            : Number(todayIst.slice(0, 4)) || new Date().getFullYear();

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

                const monthBounds = getIstMonthBounds();
                const defaultStart = monthBounds.from;
                const defaultEnd = monthBounds.to || getIstDate();

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
                    projectTasks: await getTasksByProjectId({
                        project_id: customerProject.id,
                    }),
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
                    TASK_STATE_LABELS,
                    entityComments: await listEntityComments({
                        entity_type: "project",
                        entity_id: customerProject.id,
                    }),
                }));
            })
            .get("/app/tasks", async ({ render, session }) => {
                const allTasks = await getAllTasks();
                const sprintTasks = allTasks.filter((task) => {
                    const week = task.sprint_week_start
                        ? String(task.sprint_week_start).slice(0, 10)
                        : "";
                    const state = task.state || TASK_STATES.BACKLOG;
                    return !!week && state !== TASK_STATES.BACKLOG;
                });

                return render("tasks", appPage(session, {
                    title: "Tasks — HammerByte",
                    userId: session?.id,
                    isTaskAdmin:
                        !!session?.super_admin ||
                        (Array.isArray(session?.roles) && session.roles.includes("ADMIN")),
                    tasks: sprintTasks,
                    users: await getAllUsers(),
                    projects: await getAllCustomerProjects(),
                    sprintWeekOptions: buildSprintWeekOptions(),
                    TASK_STATES,
                    TASK_STATE_LABELS,
                    TASK_PRIORITIES,
                    TASK_PRIORITY_LABELS,
                }));
            })
            .get("/app/tasks/backlog", async ({ render, session }) => {
                const allTasks = await getAllTasks();
                const backlogTasks = allTasks.filter((task) => {
                    const week = task.sprint_week_start
                        ? String(task.sprint_week_start).slice(0, 10)
                        : "";
                    const state = task.state || TASK_STATES.BACKLOG;
                    return !week || state === TASK_STATES.BACKLOG;
                });

                return render("tasks-backlog", appPage(session, {
                    title: "Backlog — Tasks — HammerByte",
                    userId: session?.id,
                    isTaskAdmin:
                        !!session?.super_admin ||
                        (Array.isArray(session?.roles) && session.roles.includes("ADMIN")),
                    tasks: backlogTasks,
                    users: await getAllUsers(),
                    projects: await getAllCustomerProjects(),
                    sprintWeekOptions: buildSprintWeekOptions(),
                    TASK_STATES,
                    TASK_STATE_LABELS,
                    TASK_PRIORITIES,
                    TASK_PRIORITY_LABELS,
                }));
            })
            .get("/app/tasks/report", async ({ render, session, query }) => {
                const defaults = defaultDateRangeLookingBack({ daysBack: 30 });
                const from = parseQueryDate(query.from) || defaults.from;
                const to = parseQueryDate(query.to) || defaults.to;

                const rangeFrom = from <= to ? from : to;
                const rangeTo = from <= to ? to : from;

                const report = await buildTaskReport({
                    from: rangeFrom,
                    to: rangeTo,
                });

                return render("tasks-report", appPage(session, {
                    title: "Tasks report — HammerByte",
                    from: rangeFrom,
                    to: rangeTo,
                    report,
                    users: await getAllUsers(),
                    projects: await getAllCustomerProjects(),
                    TASK_STATE_LABELS,
                }));
            })
            .get("/app/tasks/sprint-report", async ({ render, session, query }) => {
                const requestedWeek =
                    parseQueryDate(query.week) || getIstDate();
                const weekStart = getMondayDate(requestedWeek) || getMondayDate();
                const weekEnd = getSundayDate(weekStart);
                const report = await buildSprintBurnReport({ weekStart });

                return render("tasks-sprint-report", appPage(session, {
                    title: "Sprint burn report — HammerByte",
                    weekStart,
                    weekEnd,
                    report,
                    TASK_STATE_LABELS,
                }));
            })
            .get("/app/tasks/:id", async ({ render, session, params, redirect }) => {
                const task = await getTaskById({ id: params.id });
                if (!task) {
                    return redirect("/not-found");
                }

                const isTaskAdmin =
                    !!session?.super_admin ||
                    (Array.isArray(session?.roles) && session.roles.includes("ADMIN"));
                const sessionUserId = Number(session?.id || 0);
                const canMoveTask =
                    isTaskAdmin ||
                    (sessionUserId >= 1 &&
                        (sessionUserId === Number(task.assignee_user_id) ||
                            sessionUserId === Number(task.reviewer_user_id)));

                const projectInvoices = task.project_id
                    ? await getCustomerInvoicesByProjectId({ project_id: task.project_id })
                    : [];

                const taskSprintWeek = task.sprint_week_start
                    ? String(task.sprint_week_start).slice(0, 10)
                    : "";

                return render("task", appPage(session, {
                    title: `${task.title} — Tasks — HammerByte`,
                    task,
                    userId: session?.id,
                    isTaskAdmin,
                    canMoveTask,
                    users: await getAllUsers(),
                    projects: await getAllCustomerProjects(),
                    projectInvoices,
                    comments: await getAllTaskCommentsByTaskId({ task_id: task.id }),
                    attachments: await getAllTaskAttachmentsByTaskId({ task_id: task.id }),
                    activities: await getAllTaskActivitiesByTaskId({ task_id: task.id }),
                    sprintWeekOptions: buildSprintWeekOptions({
                        include: taskSprintWeek ? [taskSprintWeek] : [],
                    }),
                    TASK_STATES,
                    TASK_STATE_LABELS,
                    TASK_PRIORITIES,
                    TASK_PRIORITY_LABELS,
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
            .get("/app/internal-documents", async ({ render, session, redirect }) => {
                if (
                    !canManageInternalDocuments({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }
                return render(
                    "internal-documents",
                    appPage(session, {
                        title: "Internal Documents — HammerByte",
                        documents: await getAllInternalDocuments(),
                    }),
                );
            })
            .get("/app/jobs", async ({ render, session, redirect }) => {
                if (
                    !canUseJobs({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }
                return render(
                    "jobs",
                    appPage(session, {
                        title: "Jobs — HammerByte",
                        jobs: await getAllJobPositions(),
                    }),
                );
            })
            .get("/app/jobs/:id", async ({ render, session, params, redirect }) => {
                if (
                    !canUseJobs({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }
                const job = await getJobPositionById({ id: Number(params.id) });
                if (!job) {
                    return redirect("/not-found");
                }
                return render(
                    "job",
                    appPage(session, {
                        title: `${job.title} — Jobs — HammerByte`,
                        job,
                        applicants: await getJobApplicantsByJobPositionId({
                            job_position_id: job.id,
                        }),
                    }),
                );
            })
            .get("/app/job-applications/:id", async ({ render, session, params, redirect }) => {
                if (
                    !canUseJobs({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }
                const applicant = await getJobApplicantById({ id: Number(params.id) });
                if (!applicant) {
                    return redirect("/not-found");
                }
                return render(
                    "job-application",
                    appPage(session, {
                        title: `${applicant.full_name} — Jobs — HammerByte`,
                        applicant,
                        interviews: await getJobApplicantInterviewsByApplicantId({
                            job_applicant_id: applicant.id,
                        }),
                        users: await getAllUsers(),
                        entityComments: await listEntityComments({
                            entity_type: "job_application",
                            entity_id: applicant.id,
                        }),
                    }),
                );
            })
            .get("/app/servers", async ({ render, session, redirect }) => {
                if (
                    !canUseServers({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }
                return render("servers", appPage(session, {
                    title: "Servers — HammerByte",
                    servers: await getAllServers(),
                    projects: await getAllCustomerProjects(),
                }));
            })
            .get("/app/servers/:id", async ({ render, session, params, redirect, query }) => {
                if (
                    !canUseServers({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }
                const server = await getServerById({ id: Number(params.id) });
                if (!server) {
                    return redirect("/not-found");
                }
                const monthBounds = getIstMonthBounds();
                const defaultStart = monthBounds.from;
                const defaultEnd = getIstDate();
                const start = parseQueryDate(query.start) || defaultStart;
                const end = parseQueryDate(query.end) || defaultEnd;
                const alertLogStart = start <= end ? start : end;
                const alertLogEnd = start <= end ? end : start;
                return render("server", appPage(session, {
                    title: `${server.name} — Servers — HammerByte`,
                    projects: await getAllCustomerProjects(),
                    ...(await buildServerPageData(server, { alertLogStart, alertLogEnd })),
                    entityComments: await listEntityComments({
                        entity_type: "server",
                        entity_id: server.id,
                    }),
                }));
            })
            .get("/app/expenses", async ({ render, session, query }) => {
                const monthBounds = getIstMonthBounds();
                const defaultStart = monthBounds.from;
                const defaultEnd = getIstDate();

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
                const monthBounds = getIstMonthBounds();
                const defaultStart = monthBounds.from;
                const defaultEnd = getIstDate();

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
                    entityComments: await listEntityComments({
                        entity_type: "customer",
                        entity_id: customer.id,
                    }),
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
                    entityComments: await listEntityComments({
                        entity_type: "invoice",
                        entity_id: invoice.id,
                    }),
                });
            })
            .get("/app/inquiries", async ({ render, session, query }) => {
                const defaults = defaultDateRangeLookingBack({ daysBack: 30 });
                const from = parseQueryDate(query.from) || defaults.from;
                const to = parseQueryDate(query.to) || defaults.to;
                const rangeFrom = from <= to ? from : to;
                const rangeTo = from <= to ? to : from;

                return render("inquiries", appPage(session, {
                    title: "Inquiries — HammerByte",
                    from: rangeFrom,
                    to: rangeTo,
                    userId: session?.id,
                    users: await getAllUsers(),
                    inquiries: await getAllInquiries({
                        from: rangeFrom,
                        to: rangeTo,
                    }),
                    INQUIRY_STATE_LABELS,
                    INQUIRY_SOURCE_LABELS,
                    INQUIRY_FOLLOWUP_DAY_OFFSETS,
                }));
            })
            .get("/app/crm", async ({ render, session, redirect }) => {
                if (
                    !canUseCrm({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }
                return render(
                    "crm-hub",
                    appPage(session, {
                        title: "CRM — HammerByte",
                    }),
                );
            })
            .get("/app/crm/leads", async ({ render, session, redirect, query }) => {
                if (
                    !canUseCrm({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }

                const defaults = defaultDateRangeLookingBack({ daysBack: 30 });
                const from = parseQueryDate(query.from) || defaults.from;
                const to = parseQueryDate(query.to) || defaults.to;
                const rangeFrom = from <= to ? from : to;
                const rangeTo = from <= to ? to : from;

                return render(
                    "crm-leads",
                    appPage(session, {
                        title: "Leads — CRM — HammerByte",
                        from: rangeFrom,
                        to: rangeTo,
                        leads: await getAllLeads({
                            from: rangeFrom,
                            to: rangeTo,
                        }),
                        LEAD_EMAIL_KINDS,
                        LEAD_EMAIL_KIND_LABELS,
                    }),
                );
            })
            .get("/app/crm/leads/:id", async ({ render, session, redirect, params }) => {
                if (
                    !canUseCrm({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }

                const lead = await getLeadDetail({ lead_id: params.id });
                if (!lead) {
                    return redirect("/not-found");
                }

                const communications = await getLeadCommunicationsByLeadId({
                    lead_id: lead.id,
                });
                const smsCommunications = communications.filter(
                    (row) => row.channel === LEAD_COMMUNICATION_CHANNELS.SMS,
                );
                const emailCommunications = communications.filter(
                    (row) => row.channel === LEAD_COMMUNICATION_CHANNELS.EMAIL,
                );
                const whatsappCommunications = communications.filter(
                    (row) => row.channel === LEAD_COMMUNICATION_CHANNELS.WHATSAPP,
                );

                return render(
                    "crm-lead",
                    appPage(session, {
                        title: `${lead.full_name} — CRM — HammerByte`,
                        lead,
                        notes: await getAllLeadNotesByLeadId({ lead_id: lead.id }),
                        smsCommunications,
                        emailCommunications,
                        whatsappCommunications,
                        LEAD_EMAIL_KINDS,
                        LEAD_EMAIL_KIND_LABELS,
                        LEAD_COMMUNICATION_CHANNEL_LABELS,
                        currentUserId: session?.id,
                    }),
                );
            })
            .get("/app/crm/consultation-topics", async ({ render, session, redirect }) => {
                if (
                    !canUseCrm({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }
                return render(
                    "crm-consultation-topics",
                    appPage(session, {
                        title: "Consultation topics — CRM — HammerByte",
                        topics: await getAllConsultationTopics(),
                    }),
                );
            })
            .get("/app/crm/consultation-slots", async ({ render, session, redirect, query }) => {
                if (
                    !canUseCrm({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }
                const defaults = defaultDateRangeDays({ daysAhead: 14 });
                const from = parseQueryDate(query.from) || defaults.from;
                const to = parseQueryDate(query.to) || defaults.to;
                const rangeFrom = from <= to ? from : to;
                const rangeTo = from <= to ? to : from;
                return render(
                    "crm-consultation-slots",
                    appPage(session, {
                        title: "Consultation slots — CRM — HammerByte",
                        from: rangeFrom,
                        to: rangeTo,
                        slots: await getAllConsultationSlots({
                            from: rangeFrom,
                            to: rangeTo,
                        }),
                        userId: session?.id,
                    }),
                );
            })
            .get("/app/crm/consultations", async ({ render, session, redirect, query }) => {
                if (
                    !canUseCrm({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }
                const defaults = defaultDateRangeLookingBack({ daysBack: 7 });
                const ahead = defaultDateRangeDays({ daysAhead: 30 });
                const from = parseQueryDate(query.from) || defaults.from;
                const to = parseQueryDate(query.to) || ahead.to;
                const rangeFrom = from <= to ? from : to;
                const rangeTo = from <= to ? to : from;
                return render(
                    "crm-consultations",
                    appPage(session, {
                        title: "Consultation bookings — CRM — HammerByte",
                        from: rangeFrom,
                        to: rangeTo,
                        bookings: await getAllConsultationBookings({
                            from: rangeFrom,
                            to: rangeTo,
                        }),
                        CONSULTATION_STATUSES,
                        CONSULTATION_STATUS_LABELS,
                        userId: session?.id,
                    }),
                );
            })
            .get("/app/crm/consultation-settings", async ({ render, session, redirect }) => {
                if (
                    !canUseCrm({
                        id: session?.id,
                        super_admin: !!session?.super_admin,
                        authorities: session?.authorities ?? [],
                    })
                ) {
                    return redirect("/app");
                }
                return render(
                    "crm-consultation-settings",
                    appPage(session, {
                        title: "Consultation settings — CRM — HammerByte",
                        settings: await getConsultationSettings(),
                    }),
                );
            })
            .get("/app/inquiries-report", async ({ render, session, query }) => {
                const defaults = defaultDateRangeLookingBack({ daysBack: 30 });
                const from = parseQueryDate(query.from) || defaults.from;
                const to = parseQueryDate(query.to) || defaults.to;
                const rangeFrom = from <= to ? from : to;
                const rangeTo = from <= to ? to : from;
                const report = await buildInquiryReport({
                    from: rangeFrom,
                    to: rangeTo,
                });

                return render("inquiries-report", appPage(session, {
                    title: "Inquiries report — HammerByte",
                    from: rangeFrom,
                    to: rangeTo,
                    report,
                    INQUIRY_STATE_LABELS,
                }));
            })
            .get("/app/inquiries/:id", async ({ render, session, params, redirect }) => {
                const inquiry = await getInquiryById({ id: params.id });
                if (!inquiry) {
                    return redirect("/not-found");
                }

                return render("inquiry", appPage(session, {
                    title: `Inquiry #${inquiry.id} — HammerByte`,
                    inquiry,
                    userId: session?.id,
                    users: await getAllUsers(),
                    notes: await getAllInquiryNotesByInquiryId({
                        inquiry_id: inquiry.id,
                    }),
                    followups: await getAllInquiryFollowupsByInquiryId({
                        inquiry_id: inquiry.id,
                    }),
                    activities: await getAllInquiryActivitiesByInquiryId({
                        inquiry_id: inquiry.id,
                    }),
                    INQUIRY_STATE_LABELS,
                    INQUIRY_SOURCE_LABELS,
                    INQUIRY_FOLLOWUP_DAY_OFFSETS,
                }));
            })
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
                const contractEmail = String(contract.email || "").trim().toLowerCase();
                const existingUserForEmail = contractEmail
                    ? await getUserByEmail({ email: contractEmail })
                    : null;

                return render("contract", appPage(session, {
                    title: `Contract #${contract.id} — HammerByte`,
                    contract,
                    attachments: await getAllContractAttachments(),
                    required_attachments: requiredAttachments,
                    is_signed: isContractSigned(requiredAttachments),
                    user_exists_for_email: !!existingUserForEmail,
                    allRoles: await getAllRoles(),
                    USER_LOGIN_METHODS,
                    USER_LOGIN_METHOD_LABELS,
                    USER_LOGIN_EMAILS,
                    USER_LOGIN_EMAIL_LABELS,
                    CONTRACT_BROKEN_BY,
                    CONTRACT_BROKEN_BY_LABELS,
                    clauses: clauses.map((clause) => ({
                        ...clause,
                        subclauses: subclauses.filter(
                            (subclause) => subclause.clause_id === clause.id,
                        ),
                    })),
                    entityComments: await listEntityComments({
                        entity_type: "contract",
                        entity_id: contract.id,
                    }),
                }));
            })
            .get("/app/users", async ({ render, session }) =>
                render("users", appPage(session, {
                    title: "Users — HammerByte",
                    users: await getAllUsers(),
                    allRoles: await getAllRoles(),
                    USER_LOGIN_METHODS,
                    USER_LOGIN_METHOD_LABELS,
                    USER_LOGIN_EMAILS,
                    USER_LOGIN_EMAIL_LABELS,
                })),
            )
            .get("/app/users/:id", async ({ render, session, params, redirect }) => {
                const user = await getUserById({ id: Number(params.id) });
                if (!user) {
                    return redirect("/not-found");
                }
                return render("user", appPage(session, {
                    title: `${user.full_name} — Users — HammerByte`,
                    user,
                }));
            })
            .get("/app/roles", async ({ render, session }) =>
                render("roles", appPage(session, {
                    title: "Roles — HammerByte",
                    allRoles: await getAllRoles(),
                    allAuthorities: await getAllAuthorities(),
                })),
            )
            .get("/app/roles/:id", async ({ render, session, params, redirect }) => {
                const role = await getRoleById({ id: Number(params.id) });
                if (!role) {
                    return redirect("/not-found");
                }
                return render("role", appPage(session, {
                    title: `${role.title} — Roles — HammerByte`,
                    role,
                    roleAuthorities: await getRoleAuthoritiesByRoleId({ role_id: role.id }),
                }));
            })
            .get("/app/authorities", async ({ render, session }) =>
                render("authorities", appPage(session, {
                    title: "Authorities — HammerByte",
                    allAuthorities: await getAllAuthorities(),
                })),
            )
            .get("/app/services/:id", async ({ render, session, params, redirect }) => {
                const service = await getServiceById({ id: Number(params.id) });
                if (!service) {
                    return redirect("/not-found");
                }
                return render("service", appPage(session, {
                    title: `${service.title} — Services — HammerByte`,
                    service,
                }));
            })
            .get("/app/expenses/:id", async ({ render, session, params, redirect }) => {
                const expense = await getExpenseById({ id: Number(params.id) });
                if (!expense) {
                    return redirect("/not-found");
                }
                return render("expense", appPage(session, {
                    title: `${expense.title} — Expenses — HammerByte`,
                    expense,
                }));
            })
            .get("/app/internal-documents/:id", async ({ render, session, params, redirect }) => {
                const document = await getInternalDocumentById({ id: Number(params.id) });
                if (!document) {
                    return redirect("/not-found");
                }
                return render("internal-document", appPage(session, {
                    title: `${document.media_name || "Document"} — Internal documents — HammerByte`,
                    document,
                }));
            })
            .get("/app/gem-tenders", ({ render, session }) =>
                render("gem-tenders-hub", appPage(session, {
                    title: "GEM Tenders — HammerByte",
                })),
            )
            .get("/app/gem-documents", async ({ render, session, redirect }) => {
                const currentUser = {
                    id: session?.id,
                    super_admin: !!session?.super_admin,
                    authorities: session?.authorities ?? [],
                };
                if (!canUseGemSection(currentUser)) {
                    return redirect("/app");
                }
                return render(
                    "gem-documents",
                    appPage(session, {
                        title: "Documents — GEM Tenders — HammerByte",
                        documents: await getAllGemDocuments(),
                        canManage: canManageGemDocuments(currentUser),
                    }),
                );
            })
            .get("/app/gem-categories", async ({ render, session, redirect }) => {
                if (
                    !canUseGemCategories(session?.authorities, {
                        super_admin: session?.super_admin,
                    })
                ) {
                    return redirect("/app/gem-tenders");
                }
                return render(
                    "gem-categories",
                    appPage(session, {
                        title: "Scanner — GEM Tenders — HammerByte",
                        groups: await getAllGemCategoryGroups(),
                        categories: await getAllGemCategories(),
                        scanKeywords: await getAllGemScanKeywords(),
                        tenderCategories: await getAllGemTenderCategories(),
                    }),
                );
            })
            .get("/app/gem-tender-scan-history", async ({ render, session, redirect }) => {
                if (
                    !canUseGemCategories(session?.authorities, {
                        super_admin: session?.super_admin,
                    })
                ) {
                    return redirect("/app");
                }
                return render(
                    "gem-tender-scan-history",
                    appPage(session, {
                        runs: await getAllGemTenderScanRuns(),
                        GEM_TENDER_SCAN_TYPE_LABELS,
                    }),
                );
            })
            .get("/app/gem-keyword-tenders", ({ redirect, query }) => {
                const search = new URLSearchParams(query || {}).toString();
                return redirect(`/app/gem-tenders/list${search ? `?${search}` : ""}`);
            })
            .get("/app/gem-keyword-tenders/:id", ({ redirect, params }) =>
                redirect(`/app/gem-tenders/${encodeURIComponent(params.id)}`),
            )
            .get("/app/gem-keyword-tender-report", ({ redirect, query }) => {
                const search = new URLSearchParams(query || {}).toString();
                return redirect(`/app/gem-tender-report${search ? `?${search}` : ""}`);
            })
            .get("/app/gem-tenders/list", async ({ render, session, query }) => {
                const defaults = defaultDateRangeDays({ daysAhead: 7 });
                const from =
                    parseQueryDate(query.from) || defaults.from;
                const to =
                    parseQueryDate(query.to) || defaults.to;

                const rangeFrom = from <= to ? from : to;
                const rangeTo = from <= to ? to : from;

                return render("gem-tenders", appPage(session, {
                    title: "Tenders — GEM Tenders — HammerByte",
                    from: rangeFrom,
                    to: rangeTo,
                    userId: session?.id,
                    tenderCategories: await getAllGemTenderCategories(),
                    users: await getAllUsers(),
                    tenders: await getAllGemTenders({
                        from: rangeFrom,
                        to: rangeTo,
                    }),
                    GEM_TENDER_STAGE_LABELS,
                    GEM_TENDER_ELIGIBILITY_CHOICE_LABELS,
                }));
            })
            .get("/app/gem-tender-report", async ({ render, session, query }) => {
                const defaults = defaultDateRangeLookingBack({ daysBack: 6 });
                const from =
                    parseQueryDate(query.from) || defaults.from;
                const to =
                    parseQueryDate(query.to) || defaults.to;

                const rangeFrom = from <= to ? from : to;
                const rangeTo = from <= to ? to : from;
                const report = await buildGemTenderReport({
                    from: rangeFrom,
                    to: rangeTo,
                });

                return render("gem-tender-report", appPage(session, {
                    title: "Employee activity — GEM Tenders — HammerByte",
                    from: rangeFrom,
                    to: rangeTo,
                    report,
                }));
            })
            .get(
                "/app/gem-tenders/:id",
                async ({ render, session, params, redirect }) => {
                    const tender = await getGemTenderById({ id: params.id });
                    if (!tender) {
                        return redirect("/not-found");
                    }

                    const canManageDocuments = canManageTenderDocuments({
                        currentUser: {
                            id: session?.id,
                            super_admin: !!session?.super_admin,
                        },
                        tender,
                    });

                    return render("gem-tender", appPage(session, {
                        title: `Tender ${tender.tender_id} — HammerByte`,
                        tender,
                        userId: session?.id,
                        users: await getAllUsers(),
                        tenderCategories: await getAllGemTenderCategories(),
                        activities: await getAllGemTenderActivitiesByTenderId({
                            gem_tender_id: tender.id,
                        }),
                        comments: await getAllGemTenderCommentsByTenderId({
                            gem_tender_id: tender.id,
                        }),
                        documents: await getAllGemTenderDocumentsByTenderId({
                            gem_tender_id: tender.id,
                        }),
                        canManageDocuments,
                        relockMessage: relockStateOf(tender)?.lock_message || "",
                        GEM_TENDER_STAGE_LABELS,
                        GEM_TENDER_PIPELINE_STAGES,
                        GEM_TENDER_ELIGIBILITY_CHOICE_LABELS,
                        GEM_TENDER_FILING_MIN_DOCUMENTS,
                        GEM_TENDER_LOCK_MESSAGES,
                    }));
                },
            ),
    );
