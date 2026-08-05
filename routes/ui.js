import { Elysia } from "elysia";
import { CONSTANTS } from "@hammerbyte/utils";
import requireSession from "../middlewares/require_session.js";
import { getCurrentSession } from "../services/auth.js";
import { getSession, SESSION_COOKIE } from "../libs/session.js";
import {
    getAllProjectApplications,
    getProjectApplicationById,
    getProjectApplicationsByProjectId,
} from "../db/project_applications.js";
import { getAllServices } from "../db/services.js";
import { getServicesByApplicationId, getApplicationServiceById } from "../db/application_services.js";
import { getAllInquiries } from "../db/inquiries.js";
import { getMailsByApplicationServiceId } from "../db/mails.js";
import { getAllCustomers, getCustomerById } from "../db/customers.js";
import {
    getCustomerProjectById,
    getCustomerProjectsByCustomerId,
    getAllCustomerProjects,
} from "../db/customer_projects.js";
import { getAllProjects, getProjectById } from "../db/projects.js";
import { getExpensesByDateRange } from "../db/expenses.js";
import { getAllCustomerInvoices } from "../db/customer_invoices.js";

const { SERVICES } = CONSTANTS.SAAS;

function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export const uiRoutes = new Elysia()
    .get("/", ({ render }) =>
        render("index", {
            title: "Home",
            message: "Welcome to the separated UI Route!",
        }),
    )
    .get("/about", ({ render }) =>
        render("index", {
            title: "About Us",
            message: "This is the About page.",
        }),
    )
    .get("/login", ({ render, cookie, redirect }) => {
        if (getCurrentSession({ cookie })) {
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
    .guard({ beforeHandle: [requireSession] }, (app) =>
        app
            .derive(({ cookie }) => ({
                session: getSession(cookie[SESSION_COOKIE]?.value),
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
            .get("/app/applications/:id/edit", async ({ render, session, params, redirect }) => {
                const application = await getProjectApplicationById({ id: Number(params.id) });
                if (!application) {
                    return redirect("/not-found");
                }

                return render("application-edit", {
                    title: `Edit — ${application.title}`,
                    username: session?.username,
                    application,
                    customerProjects: await getAllCustomerProjects(),
                });
            })
            .get("/app/applications/:id/services", async ({ render, session, params, redirect }) => {
                const application = await getProjectApplicationById({ id: Number(params.id) });
                if (!application) {
                    return redirect("/not-found");
                }

                const linkedServices = await getServicesByApplicationId({
                    application_id: application.id,
                });
                const linkedServiceIds = new Set(
                    linkedServices.map((service) => Number(service.service_id)),
                );
                const availableServices = (await getAllServices()).filter(
                    (service) => !linkedServiceIds.has(Number(service.id)),
                );

                return render("application-services", {
                    title: `Services — ${application.title}`,
                    username: session?.username,
                    application,
                    services: linkedServices,
                    availableServices,
                });
            })
            .get(
                "/app/applications/:id/application-services/:application_service_id",
                async ({ render, session, params, query, redirect }) => {
                    const application = await getProjectApplicationById({
                        id: Number(params.id),
                    });
                    const applicationService = await getApplicationServiceById({
                        id: Number(params.application_service_id),
                    });

                    if (
                        !application ||
                        !applicationService ||
                        applicationService.application_id !== application.id
                    ) {
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

                    if (applicationService.title === SERVICES.MAILER) {
                        usage = await getMailsByApplicationServiceId({
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
                    projects: await getAllProjects(),
                }),
            )
            .get("/app/projects/:id", async ({ render, session, params, redirect }) => {
                const project = await getProjectById({ id: Number(params.id) });
                if (!project) {
                    return redirect("/not-found");
                }

                return render("project", {
                    title: `Project — ${project.title}`,
                    username: session?.username,
                    project,
                });
            })
            .get("/app/expenses", async ({ render, session, query }) => {
                const now = new Date();
                const defaultStart = toDateInputValue(
                    new Date(now.getFullYear(), now.getMonth(), 1),
                );
                const defaultEnd = toDateInputValue(now);

                const start =
                    typeof query.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.start)
                        ? query.start
                        : defaultStart;
                const end =
                    typeof query.end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.end)
                        ? query.end
                        : defaultEnd;

                const rangeStart = start <= end ? start : end;
                const rangeEnd = start <= end ? end : start;
                const expenses = await getExpensesByDateRange({
                    start: rangeStart,
                    end: rangeEnd,
                });
                const totalAmount = expenses.reduce(
                    (sum, expense) => sum + Number(expense.amount || 0),
                    0,
                );

                return render("expenses", {
                    title: "Expenses — HammerByte",
                    username: session?.username,
                    expenses,
                    start: rangeStart,
                    end: rangeEnd,
                    totalAmount,
                    itemCount: expenses.length,
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
                const customer = await getCustomerById({ id: Number(params.id) });
                if (!customer) {
                    return redirect("/not-found");
                }

                return render("customer", {
                    title: `Customer — ${customer.full_name}`,
                    username: session?.username,
                    customer,
                    customerProjects: await getCustomerProjectsByCustomerId({
                        customer_id: customer.id,
                    }),
                });
            })
            .get(
                "/app/customers/:id/projects/:projectId",
                async ({ render, session, params, redirect }) => {
                    const customer = await getCustomerById({ id: Number(params.id) });
                    const customerProject = await getCustomerProjectById({
                        id: Number(params.projectId),
                    });

                    if (
                        !customer ||
                        !customerProject ||
                        Number(customerProject.customer_id) !== Number(customer.id)
                    ) {
                        return redirect("/not-found");
                    }

                    return render("customer-project", {
                        title: `Project — ${customerProject.title}`,
                        username: session?.username,
                        customer,
                        customerProject,
                        applications: await getProjectApplicationsByProjectId({
                            project_id: customerProject.id,
                        }),
                    });
                },
            )
            .get("/app/invoices", async ({ render, session }) =>
                render("invoices", {
                    title: "Invoices — HammerByte",
                    username: session?.username,
                    invoices: await getAllCustomerInvoices(),
                    customers: await getAllCustomers(),
                }),
            )
            .get("/app/inquiries", async ({ render, session }) =>
                render("inquiries", {
                    title: "Inquiries — HammerByte",
                    username: session?.username,
                    inquiries: await getAllInquiries(),
                }),
            ),
    );
