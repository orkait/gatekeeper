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
}

export interface AppEnv {
    Bindings: Bindings;
    Variables: Record<string, unknown>;
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
        isProduction: environment === "production",
        isDevelopment: environment === "development",
        isTest: environment === "test",
    } as const;
}

export type EnvConfig = ReturnType<typeof getEnv>;

export function validateEnv(bindings: Partial<Bindings>): bindings is Bindings {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!bindings.DB && bindings.ENVIRONMENT !== "test") {
        errors.push("Missing required binding: DB");
    }
    if (!bindings.JWT_SECRET) {
        errors.push("Missing required secret: JWT_SECRET");
    }
    if (!bindings.INTERNAL_SECRET) {
        errors.push("Missing required secret: INTERNAL_SECRET");
    }

    // AUTH_CACHE is optional but recommended for performance
    if (!bindings.AUTH_CACHE && bindings.ENVIRONMENT === "production") {
        warnings.push("Missing optional binding: AUTH_CACHE (recommended for production performance)");
    }

    if (warnings.length > 0) {
        console.warn("Environment warnings:", warnings.join(", "));
    }

    if (errors.length > 0) {
        console.error("Environment validation failed:", errors.join(", "));
        return false;
    }

    return true;
}
