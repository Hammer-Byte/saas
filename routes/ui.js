import { Elysia } from "elysia";

export const uiRoutes = new Elysia()
    .get("/", ({ render }) =>
        render("index", {
            title: "Home",
            message: "Welcome to the separated UI Route!",
        })
    )
    .get("/login", ({ render }) =>
        render("login", {
            title: "Login",
        })
    )
    .get("/verification", ({ render, query }) =>
        render("verification", {
            title: "Verify OTP",
            email: query.email ?? "",
        })
    )
    .get("/about", ({ render }) =>
        render("index", {
            title: "About Us",
            message: "This is the About page.",
        })
    );
