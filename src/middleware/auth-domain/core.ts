import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuthService } from "../../services/auth";
import { extractBearerToken } from "../../utils";

export interface AuthContext {
    userId: string;
    email: string;
    tenantId?: string;
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
    // Idempotent: skip if already authenticated
    const existingAuth = c.get("auth") as AuthContext | undefined;
    if (existingAuth) {
        await next();
        return;
    }

    const authService = c.get("authService") as AuthService;
    const token = extractBearerToken(c);
    const payload = await authService.verifyAccessToken(token);

    if (!payload) {
        throw new HTTPException(401, {
            message: "Invalid or expired token"
        });
    }

    const authContext: AuthContext = {
        userId: payload.sub,
        email: payload.email,
        tenantId: payload.tenant_id
    };

    c.set("auth", authContext);
    await next();
}

export function getAuth(c: Context): AuthContext {
    const auth = c.get("auth") as AuthContext | undefined;
    if (!auth) {
        throw new HTTPException(401, { message: "Authentication required" });
    }
    return auth;
}

export async function internalAuthMiddleware(c: Context, next: Next): Promise<Response | void> {
    const internalSecret = c.get("internalSecret") as string;
    const providedSecret = c.req.header("X-Internal-Secret");

    if (!providedSecret || providedSecret !== internalSecret) {
        throw new HTTPException(401, { message: "Invalid internal secret" });
    }

    await next();
}
