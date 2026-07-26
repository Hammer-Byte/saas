import { Elysia } from "elysia";
import requireSession from "../middlewares/require_session.js";
import { getCurrentSession } from "../services/auth.js";
import { getSession, SESSION_COOKIE } from "../libs/session.js";

const APP_SECTIONS = {
    applications: {
        title: "Applications",
        description: "Manage registered client applications, tokens, and access.",
    },
    services: {
        title: "Services",
        description: "Configure mailer, bucketizer, and other platform services.",
    },
    usages: {
        title: "Usages",
        description: "Review usage, inquiries, and activity across applications.",
    },
    configuration: {
        title: "Configuration",
        description: "Update platform settings and environment preferences.",
    },
};

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
            .get("/app/:section", ({ render, session, params, redirect }) => {
                const section = APP_SECTIONS[params.section];
                if (!section) {
                    return redirect("/app");
                }

                return render("app-section", {
                    title: `${section.title} — HammerByte`,
                    username: session?.username,
                    sectionTitle: section.title,
                    sectionDescription: section.description,
                });
            }),
    );
