import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { staticPlugin } from "@elysiajs/static";
import ejs from "ejs";
import { join } from "node:path";
import hammerbyteUtils from "@hammerbyte/utils";
import { logger, middlewares } from "@hammerbyte/utils";
import { uiRoutes } from "./routes/ui.js";
import { apiRoutes } from "./routes/api.js";
import { SWAGGER } from "./constants.js";

const { HEADERS } = hammerbyteUtils.CONSTANTS.SAAS;

const app = new Elysia().use(
    cors({
        origin: true,
        credentials: false,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", HEADERS.APPLICATION_ID, HEADERS.APPLICATION_TOKEN],
    }),
).use(
    swagger({
        documentation: {
            info: {
                title: SWAGGER.APPLICATION,
                version: "2.0.0",
            },
        },
    }),
);


app.onRequest(middlewares.bun.requestLogger);

// 1. Setup Static Files (This allows the browser to access your /public folder)
app.use(
    staticPlugin({
        assets: "public",
        prefix: "/public",
    }),
);
// 1. Static Files
app.use(staticPlugin({ assets: "public", prefix: "/public" }));

// 2. The Render Decorator
app.decorate("render", async (template, data = {}) => {
    const path = join(import.meta.dir, "views", `${template}.ejs`);
    const html = await ejs.renderFile(path, data);
    return new Response(html, { headers: { "Content-Type": "text/html" } });
});

// 3. Plugin the separated routes
app.use(uiRoutes);
app.use(apiRoutes);


export async function allowTraffic() {
    app.listen(Bun.env.PORT);
    logger.success(`App started at http://127.0.0.1:${Bun.env.PORT || 3000}`);
}
