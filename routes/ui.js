import { Elysia } from "elysia";
import requireSession from "../middlewares/require_session.js";
import { getCurrentSession } from "../services/auth.js";
import { getSession, SESSION_COOKIE } from "../libs/session.js";
import { getAllApplications, getApplicationById } from "../db/applications.js";
import { getAllServices } from "../db/services.js";
import { getServicesByApplicationId } from "../db/application_services.js";
import { getAllInquiries } from "../db/inquiries.js";

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
                    return redirect("/app/applications");
                }

                return render("application-services", {
                    title: `Services — ${application.title}`,
                    username: session?.username,
                    application,
                    services: await getServicesByApplicationId({ application_id: application.id }),
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
