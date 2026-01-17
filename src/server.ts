import { Hono } from "hono";
import type { AppEnv } from "./env";
import { getEnv } from "./env";
import { createAPIRouter } from "./routes";
import { errorHandler } from "./middleware/error-handler";
import { createCorsMiddleware } from "./middleware/cors";
import { requestLogger } from "./middleware/logger";
import { injectServices } from "./middleware/service-injector";

function createApp() {
    const app = new Hono<AppEnv>();

    app.onError(errorHandler);
    app.use("*", requestLogger);
    app.use("*", async (c, next) => {
        const corsMiddleware = createCorsMiddleware(getEnv(c.env));
        return corsMiddleware(c, next);
    });
    app.use("*", injectServices);

    // Root endpoint
    app.get("/", (c) => c.json({
        name: "Orkait Auth & Subscription Service",
        version: "1.0.0",
        endpoints: {
            health: "/api/health",
            auth: "/api/auth",
            users: "/api/users",
            subscriptions: "/api/subscriptions",
            internal: "/api/internal",
        },
    }));

    // Mount API routes
    app.route("/api", createAPIRouter());

    // 404 handler
    app.notFound((c) => c.json({
        success: false,
        error: "Not found",
        path: c.req.path,
    }, 404));

    return app;
}

export default createApp();
