import { Elysia } from "elysia";

export const apiRoutes = new Elysia({ prefix: "/api" })
    .get("/status", () => ({
        status: "online",
        runtime: "Bun",
    }))
    .post("/submit", ({ body }) => {
        return { success: true, received: body };
    });
