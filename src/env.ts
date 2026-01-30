import { logger } from "./utils/logger";

export interface Bindings {
    DB: D1Database;
    AUTH_CACHE: KVNamespace;
    BACKUP_BUCKET?: R2Bucket;
    ENVIRONMENT: "production" | "development" | "staging" | "test";
    JWT_SECRET: string;
    JWT_EXPIRES_IN?: string;
    REFRESH_TOKEN_EXPIRES_IN?: string;
    GOOGLE_CLIENT_ID?: string;
    INTERNAL_SECRET: string;
    WEBHOOK_TIMEOUT_MS?: string;
    WEBHOOK_MAX_RETRIES?: string;
    ALLOWED_ORIGINS?: string;
    STORAGE_ADAPTER?: "memory" | "d1" | "auto";
    // RSA keys for asymmetric JWT signing (JWKS)
    RSA_PRIVATE_KEY?: string;
    RSA_PUBLIC_KEY?: string;
    RSA_KEY_ID?: string;
    // Email configuration (Resend)
    RESEND_API_KEY?: string;
    FROM_EMAIL?: string;
    APP_URL?: string;
}

export interface AppEnv {
    Bindings: Bindings;
    Variables: {
        authDB: import("./utils/db").AuthDB;
        authRepository: import("./repositories").AuthRepository;
        authService: import("./services/auth").AuthService;
        emailService?: import("./services/email").EmailService;
        internalSecret: string;
        requestId: string;
        auth?: import("./middleware/auth-domain/core").AuthContext;
        [key: string]: unknown;
    };
}

export function getEnv(bindings: Bindings) {
    const environment = bindings.ENVIRONMENT || "production";

    return {
        db: bindings.DB,
        authCache: bindings.AUTH_CACHE,
        backupBucket: bindings.BACKUP_BUCKET,
        environment,
        jwtSecret: bindings.JWT_SECRET,
        jwtExpiresIn: parseInt(bindings.JWT_EXPIRES_IN || "900", 10),
        refreshTokenExpiresIn: parseInt(bindings.REFRESH_TOKEN_EXPIRES_IN || "604800", 10),
        googleClientId: bindings.GOOGLE_CLIENT_ID,
        internalSecret: bindings.INTERNAL_SECRET,
        webhookTimeoutMs: parseInt(bindings.WEBHOOK_TIMEOUT_MS || "5000", 10),
        webhookMaxRetries: parseInt(bindings.WEBHOOK_MAX_RETRIES || "3", 10),
        allowedOrigins: bindings.ALLOWED_ORIGINS?.split(",").map(o => o.trim()) || ["*"],
        storageAdapter: bindings.STORAGE_ADAPTER || "auto",
        rsaPrivateKey: bindings.RSA_PRIVATE_KEY,
        rsaPublicKey: bindings.RSA_PUBLIC_KEY,
        rsaKeyId: bindings.RSA_KEY_ID,
        resendApiKey: bindings.RESEND_API_KEY,
        fromEmail: bindings.FROM_EMAIL || "noreply@orkait.com",
        appUrl: bindings.APP_URL || "https://orkait.com",
        isProduction: environment === "production",
        isDevelopment: environment === "development",
        isTest: environment === "test",
    } as const;
}

export type EnvConfig = ReturnType<typeof getEnv>;

export function validateEnv(bindings: Partial<Bindings>): bindings is Bindings {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Critical requirements
    if (!bindings.DB && bindings.ENVIRONMENT !== "test") {
        errors.push("Missing required binding: DB");
    }
    if (!bindings.JWT_SECRET) {
        errors.push("Missing required secret: JWT_SECRET");
    }
    if (!bindings.INTERNAL_SECRET) {
        errors.push("Missing required secret: INTERNAL_SECRET");
    }

    // Validate JWT_SECRET strength
    if (bindings.JWT_SECRET && bindings.JWT_SECRET.length < 32) {
        errors.push("JWT_SECRET must be at least 32 characters long");
    }

    // Validate INTERNAL_SECRET strength
    if (bindings.INTERNAL_SECRET && bindings.INTERNAL_SECRET.length < 32) {
        errors.push("INTERNAL_SECRET must be at least 32 characters long");
    }

    // AUTH_CACHE is optional but recommended for performance
    if (!bindings.AUTH_CACHE && bindings.ENVIRONMENT === "production") {
        warnings.push("Missing optional binding: AUTH_CACHE (recommended for production performance)");
    }

    // Validate RSA keys configuration (all or nothing)
    const hasRsaPrivate = !!bindings.RSA_PRIVATE_KEY;
    const hasRsaPublic = !!bindings.RSA_PUBLIC_KEY;
    if (hasRsaPrivate !== hasRsaPublic) {
        errors.push("RSA_PRIVATE_KEY and RSA_PUBLIC_KEY must both be set or both be unset");
    }

    // Validate email configuration (all or nothing)
    const hasResendKey = !!bindings.RESEND_API_KEY;
    const hasFromEmail = !!bindings.FROM_EMAIL;
    const hasAppUrl = !!bindings.APP_URL;
    if (hasResendKey && (!hasFromEmail || !hasAppUrl)) {
        warnings.push("RESEND_API_KEY is set but FROM_EMAIL or APP_URL is missing - email features may not work");
    }

    // Validate Google OAuth configuration
    if (bindings.GOOGLE_CLIENT_ID && bindings.GOOGLE_CLIENT_ID.length < 20) {
        warnings.push("GOOGLE_CLIENT_ID appears invalid - should be a long string from Google Console");
    }

    // Validate numeric configurations
    if (bindings.JWT_EXPIRES_IN && isNaN(parseInt(bindings.JWT_EXPIRES_IN, 10))) {
        errors.push("JWT_EXPIRES_IN must be a valid number (seconds)");
    }
    if (bindings.REFRESH_TOKEN_EXPIRES_IN && isNaN(parseInt(bindings.REFRESH_TOKEN_EXPIRES_IN, 10))) {
        errors.push("REFRESH_TOKEN_EXPIRES_IN must be a valid number (seconds)");
    }

    if (warnings.length > 0) {
        logger.warn("Environment warnings", { warnings });
    }

    if (errors.length > 0) {
        logger.error("Environment validation failed", undefined, { errors });
        return false;
    }

    return true;
}
