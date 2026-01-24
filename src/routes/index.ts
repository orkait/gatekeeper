import { Hono } from "hono";
import authRoutes from "./auth.routes";
import apikeyRoutes from "./apikey.routes";
import keysRoutes from "./keys.routes";
import authorizeRoutes from "./authorize.routes";
import webhookRoutes from "./webhook.routes";
import tenantRoutes from "./tenant.routes";

export function createAPIRouter() {
    const api = new Hono();

    api.get("/health", (c) => c.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        service: "orkait-auth",
    }));

    api.route("/auth", authRoutes);
    api.route("/auth/apikey", apikeyRoutes);
    api.route("/keys", keysRoutes);
    api.route("/authorize", authorizeRoutes);
    api.route("/webhooks", webhookRoutes);
    api.route("/tenants", tenantRoutes);

    return api;
}
