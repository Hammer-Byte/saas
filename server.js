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

/** Bun default is 128MB — large internal docs need more. Override with MAX_REQUEST_BODY_SIZE (bytes). */
const maxRequestBodySize = Number(Bun.env.MAX_REQUEST_BODY_SIZE) || 1024 * 1024 * 1024;
const idleTimeout = Number(Bun.env.SERVER_IDLE_TIMEOUT) || 255;

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

app.onError(({ request, error, code, set }) => {
    const message = error?.message || String(error);
    logger.error(
        `Request Error - ${request.method} ${request.url} | code=${code} | status=${set.status} | ${message}`,
    );
    if (error?.stack) {
        logger.error(error.stack);
    }
});

app.use(staticPlugin({ assets: "public", prefix: "/public" }));

// 2. The Render Decorator
app.decorate("render", async (template, data = {}) => {
    const viewsDir = join(import.meta.dir, "views");
    const path = join(viewsDir, `${template}.ejs`);
    const html = await ejs.renderFile(path, data, { views: [viewsDir] });
    return new Response(html, { headers: { "Content-Type": "text/html" } });
});

// 3. Plugin the separated routes
app.use(uiRoutes);
app.use(apiRoutes);

export async function allowTraffic() {
    const port = Number(Bun.env.PORT) || 3000;
    app.listen({
        port,
        maxRequestBodySize,
        idleTimeout,
    });
    const { server } = app;
    logger.success(
        `App started at ${server.url} | maxRequestBodySize=${maxRequestBodySize} idleTimeout=${idleTimeout}s`,
    );
}
