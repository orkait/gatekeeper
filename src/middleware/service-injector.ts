import type { Context, Next } from "hono";
import { AuthService } from "../services/auth.service";
import { createAdapter } from "../adapters/adapter";
import type { AppEnv } from "../env";
import { getEnv } from "../env";

let authServiceInstance: AuthService | null = null;
let currentAdapterType: string | null = null;

export async function injectServices(c: Context<AppEnv>, next: Next) {
    const envConfig = getEnv(c.env);

    let adapterType: string;

    if (envConfig.storageAdapter === "memory") {
        adapterType = "memory";
    } else if (envConfig.storageAdapter === "d1") {
        adapterType = "d1";
    } else {
        // Auto-detect
        adapterType = envConfig.isTest || !envConfig.db ? "memory" : "d1";
    }

    // Recreate service if adapter type changed
    if (!authServiceInstance || currentAdapterType !== adapterType) {
        const adapter = adapterType === "memory"
            ? await createAdapter({ type: "memory" })
            : await createAdapter({ type: "d1", db: envConfig.db });

        authServiceInstance = new AuthService(
            adapter,
            envConfig.jwtSecret,
            envConfig.jwtExpiresIn,
            envConfig.refreshTokenExpiresIn,
            envConfig.googleClientId
        );

        currentAdapterType = adapterType;
    }

    c.set("authService", authServiceInstance);
    c.set("internalSecret", envConfig.internalSecret);

    await next();
}
