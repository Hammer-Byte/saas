import { Elysia } from "elysia";
import { CONSTANTS } from "@hammerbyte/utils";
import requireSession from "../middlewares/require_session.js";
import { getCurrentSession } from "../services/auth.js";
import { getSession, SESSION_COOKIE } from "../libs/session.js";
import { getAllApplications, getApplicationById } from "../db/applications.js";
import { getAllServices } from "../db/services.js";
import { getServicesByApplicationId, getApplicationServiceById } from "../db/application_services.js";
import { getAllInquiries } from "../db/inquiries.js";
import { getMailsByApplicationServiceId } from "../db/mails.js";
import { getCustomerByApplicationId } from "../db/application_customers.js";

const { SERVICES } = CONSTANTS.SAAS;

export const uiRoutes = new Elysia()
    .get("/", ({ render }) =>
        render("index", {
            title: "Home",
            message: "Welcome to the separated UI Route!",
        })
    )
    .get("/about", ({ render }) =>
        render("index", {
            title: "About Us",
            message: "This is the About page.",
        })
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
        })
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
                    applications: await getAllApplications(),
                }),
            )
            .get("/app/applications/:id/services", async ({ render, session, params, redirect }) => {
                const application = await getApplicationById({ id: Number(params.id) });
                if (!application) {
                    return redirect("/not-found");
                }

                return render("application-services", {
                    title: `Services — ${application.title}`,
                    username: session?.username,
                    application,
                    services: await getServicesByApplicationId({ application_id: application.id }),
                });
            })
            .get("/app/applications/:id/invoices", async ({ render, session, params, redirect }) => {
                const application = await getApplicationById({ id: Number(params.id) });
                if (!application) {
                    return redirect("/not-found");
                }

                return render("application-invoices", {
                    title: `Invoices — ${application.title}`,
                    username: session?.username,
                    application,
                });
            })
            .get("/app/applications/:id/customer", async ({ render, session, params, redirect }) => {
                const application = await getApplicationById({ id: Number(params.id) });
                if (!application) {
                    return redirect("/not-found");
                }

                return render("application-customer", {
                    title: `Customer — ${application.title}`,
                    username: session?.username,
                    application,
                    customer: await getCustomerByApplicationId({ application_id: application.id }),
                });
            })
            .get("/app/applications/:id/application-services/:application_service_id", async ({ render, session, params, query, redirect }) => {
                const application = await getApplicationById({ id: Number(params.id) });
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
            })
            .get("/app/services", async ({ render, session }) =>
                render("services", {
                    title: "Services — HammerByte",
                    username: session?.username,
                    services: await getAllServices(),
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
