import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuthService } from "../services/auth.service";

export interface AuthContext {
    userId: string;
    email: string;
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
    const authService = c.get("authService") as AuthService;
    const authHeader = c.req.header("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
        throw new HTTPException(401, { message: "Authorization header required" });
    }

    const token = authHeader.slice(7);
    const payload = await authService.verifyAccessToken(token);

    if (!payload) {
        throw new HTTPException(401, { message: "Invalid or expired token" });
    }

    c.set("auth", { userId: payload.sub, email: payload.email } as AuthContext);
    await next();
}

export async function internalAuthMiddleware(c: Context, next: Next): Promise<Response | void> {
    const internalSecret = c.get("internalSecret") as string;
    const providedSecret = c.req.header("X-Internal-Secret");

    if (!providedSecret || providedSecret !== internalSecret) {
        throw new HTTPException(401, { message: "Invalid internal secret" });
    }

    await next();
}

export function getAuth(c: Context): AuthContext {
    const auth = c.get("auth") as AuthContext | undefined;
    if (!auth) {
        throw new HTTPException(401, { message: "Authentication required" });
    }
    return auth;
}
