import type { Context, Next } from "hono";
import { AuthService } from "../services/auth";
import { EmailService } from "../services/email";
import { AuthRepository } from "../repositories";
import { createAuthDB } from "../utils/db";
import { createJWKSService } from "../services/jwks";
import type { AppEnv } from "../env";
import { getEnv } from "../env";

export async function injectServices(c: Context<AppEnv>, next: Next) {
    const envConfig = getEnv(c.env);
    const db = createAuthDB(envConfig.db);
    const repository = new AuthRepository(db);

    // Inject db and repository into context for sharing across middleware and handlers
    c.set("authDB", db);
    c.set("authRepository", repository);

    let jwksService;
    if (envConfig.rsaPrivateKey && envConfig.rsaPublicKey) {
        jwksService = createJWKSService(
            envConfig.rsaPrivateKey,
            envConfig.rsaPublicKey,
            envConfig.rsaKeyId
        );
    }

    // Create EmailService if Resend API key is configured
    let emailService;
    if (envConfig.resendApiKey) {
        emailService = new EmailService({
            resendApiKey: envConfig.resendApiKey,
            fromEmail: envConfig.fromEmail,
            appUrl: envConfig.appUrl,
        });
        c.set("emailService", emailService);
    }

    const authService = new AuthService(
        repository,
        envConfig.jwtSecret,
        envConfig.jwtExpiresIn,
        envConfig.refreshTokenExpiresIn,
        envConfig.googleClientId,
        jwksService,
        emailService
    );

    c.set("authService", authService);
    c.set("internalSecret", envConfig.internalSecret);

    await next();
}

