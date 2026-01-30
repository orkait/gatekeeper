import { Hono } from "hono";
import type { AppEnv } from "./env";
import { getEnv } from "./env";
import { createAPIRouter } from "./routes";
import jwksRoutes from "./routes/jwks.routes";
import healthRoutes from "./routes/health";
import { errorHandler } from "./middleware/error-handler";
import { getCorsMiddleware } from "./middleware/cors";
import { requestLogger } from "./middleware/logger";
import { injectServices } from "./middleware/service-injector";
import { requestIdMiddleware } from "./middleware/request-id";
import { securityHeadersMiddleware } from "./middleware/security-headers";

function createApp() {
    const app = new Hono<AppEnv>();

    app.onError(errorHandler);
    app.use("*", requestIdMiddleware);
    app.use("*", securityHeadersMiddleware);
    app.use("*", requestLogger);
    app.use("*", async (c, next) => {
        const corsMiddleware = getCorsMiddleware(getEnv(c.env));
        return corsMiddleware(c, next);
    });
    app.use("*", injectServices);

    // Root endpoint
    app.get("/", (c) => c.json({
        name: "Orkait Auth & Subscription Service",
        version: "1.0.0",
        status: "operational",
        endpoints: {
            health: "/health",
            healthReady: "/health/ready",
            jwks: "/.well-known/jwks.json",
            auth: "/api/auth",
            users: "/api/users",
            subscriptions: "/api/subscriptions",
            internal: "/api/internal",
        },
    }));

    // Health check endpoints (no auth required)
    app.route("/health", healthRoutes);

    // Mount JWKS endpoint for public key distribution
    app.route("/.well-known", jwksRoutes);

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
