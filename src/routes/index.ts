import { Hono } from "hono";
import authRoutes from "./auth.routes";
import apikeyRoutes from "./apikey.routes";

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

    return api;
}
