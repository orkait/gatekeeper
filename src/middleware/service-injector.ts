import type { Context, Next } from "hono";
import { AuthService } from "../services/auth";
import { AuthRepository } from "../repositories";
import { createAuthDB } from "../utils/db";
import type { AppEnv } from "../env";
import { getEnv } from "../env";

export async function injectServices(c: Context<AppEnv>, next: Next) {
    const envConfig = getEnv(c.env);
    const db = createAuthDB(envConfig.db);
    const repository = new AuthRepository(db);

    const authService = new AuthService(
        repository,
        envConfig.jwtSecret,
        envConfig.jwtExpiresIn,
        envConfig.refreshTokenExpiresIn,
        envConfig.googleClientId
    );

    c.set("authService", authService);
    c.set("internalSecret", envConfig.internalSecret);

    await next();
}

