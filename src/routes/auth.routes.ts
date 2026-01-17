import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AuthService } from "../services/auth.service";
import { SignupSchema, LoginSchema, GoogleAuthSchema, RefreshTokenSchema } from "../schemas/auth.schema";
import { authMiddleware, getAuth } from "../middleware/auth";

export type AuthRoutesEnv = {
    Variables: { authService: AuthService };
};

const auth = new Hono<AuthRoutesEnv>();

// POST /auth/signup
auth.post("/signup", zValidator("json", SignupSchema), async (c) => {
    const authService = c.get("authService");
    const input = c.req.valid("json");

    const result = await authService.signup(input);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true, data: result.data }, 201);
});

// POST /auth/login
auth.post("/login", zValidator("json", LoginSchema), async (c) => {
    const authService = c.get("authService");
    const input = c.req.valid("json");

    const result = await authService.login(input);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 401);
    }

    return c.json({ success: true, data: result.data });
});

// POST /auth/google
auth.post("/google", zValidator("json", GoogleAuthSchema), async (c) => {
    const authService = c.get("authService");
    const input = c.req.valid("json");

    const result = await authService.googleAuth(input.idToken);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 401);
    }

    return c.json({ success: true, data: result.data });
});

// POST /auth/refresh
auth.post("/refresh", zValidator("json", RefreshTokenSchema), async (c) => {
    const authService = c.get("authService");
    const input = c.req.valid("json");

    const result = await authService.refreshAccessToken(input.refreshToken);

    if (!result.success) {
        return c.json({ success: false, error: result.error }, 401);
    }

    return c.json({ success: true, data: result.data });
});

// POST /auth/logout (requires auth)
auth.post("/logout", authMiddleware, zValidator("json", RefreshTokenSchema), async (c) => {
    const authService = c.get("authService");
    const input = c.req.valid("json");

    await authService.logout(input.refreshToken);

    return c.json({ success: true, message: "Logged out successfully" });
});

// POST /auth/logout-all (requires auth)
auth.post("/logout-all", authMiddleware, async (c) => {
    const authService = c.get("authService");
    const auth = getAuth(c);

    await authService.logoutAll(auth.userId);

    return c.json({ success: true, message: "Logged out from all devices" });
});

export default auth;
