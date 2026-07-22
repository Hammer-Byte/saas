import { Elysia } from "elysia";
import requireSession from "../middlewares/require_session.js";
import { getCurrentSession } from "../services/auth.js";
import { getSession, SESSION_COOKIE } from "../libs/session.js";

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
    .get("/login", ({ render, cookie, set }) => {
        if (getCurrentSession({ cookie })) {
            set.redirect = "/app";
            return;
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
            ),
    );
