import { cors } from "hono/cors";
import type { EnvConfig } from "../env";

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const ALLOWED_HEADERS = ["Content-Type", "Authorization", "X-API-Key", "X-Internal-Secret"];
const EXPOSED_HEADERS = ["X-RateLimit-Remaining", "X-RateLimit-Reset"];
const MAX_AGE = 86400;

const corsMiddlewareCache = new Map<string, ReturnType<typeof cors>>();

export function createCorsMiddleware(config: EnvConfig) {
    return cors({
        origin: config.allowedOrigins.includes("*")
            ? "*"
            : (origin) => config.allowedOrigins.includes(origin) ? origin : null,
        allowMethods: ALLOWED_METHODS,
        allowHeaders: ALLOWED_HEADERS,
        exposeHeaders: EXPOSED_HEADERS,
        maxAge: MAX_AGE,
        credentials: true,
    });
}

export function getCorsMiddleware(config: EnvConfig) {
    const key = config.allowedOrigins.join(",");
    const cached = corsMiddlewareCache.get(key);
    if (cached) {
        return cached;
    }

    const middleware = createCorsMiddleware(config);
    corsMiddlewareCache.set(key, middleware);
    return middleware;
}
