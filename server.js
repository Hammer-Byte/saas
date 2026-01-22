import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import ejs from "ejs";
import { join } from "node:path";
import { logger } from "@hammerbyte/utils";
import { uiRoutes } from "./routes/ui";
import { apiRoutes } from "./routes/api";

const app = new Elysia();

// 1. Setup Static Files (This allows the browser to access your /public folder)
app.use(
    staticPlugin({
        assets: "public",
        prefix: "/public",
    })
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
    logger.success(`App started at ${Bun.env.PORT || 3000}`);
}
