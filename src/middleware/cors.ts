import { cors } from "hono/cors";
import type { EnvConfig } from "../env";

export function createCorsMiddleware(config: EnvConfig) {
    return cors({
        origin: config.allowedOrigins.includes("*")
            ? "*"
            : (origin) => config.allowedOrigins.includes(origin) ? origin : null,
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Internal-Secret"],
        exposeHeaders: ["X-RateLimit-Remaining", "X-RateLimit-Reset"],
        maxAge: 86400,
        credentials: true,
    });
}
