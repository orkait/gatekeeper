// User Types
export type UserStatus = "active" | "suspended" | "deleted";

export interface User {
    id: string;
    email: string;
    passwordHash: string | null;
    emailVerified: boolean;
    googleId: string | null;
    name: string | null;
    avatarUrl: string | null;
    status: UserStatus;
    createdAt: number;
    updatedAt: number;
    lastLoginAt: number | null;
    lockedUntil: number | null;
    failedLoginCount: number;
}

export interface UserPublic {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string | null;
    avatarUrl: string | null;
    status: UserStatus;
    createdAt: number;
}

// Product Types
export type ProductStatus = "active" | "deprecated" | "disabled";

export interface ApiProduct {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    status: ProductStatus;
    createdAt: number;
    updatedAt: number;
}

// Tier Types
export type TierStatus = "active" | "deprecated";

export interface SubscriptionTier {
    id: string;
    productId: string;
    name: string;
    slug: string;
    apiCallsLimit: number;
    resourceLimit: number;
    rateLimitRpm: number;
    features: string[];
    status: TierStatus;
    createdAt: number;
}

// Subscription Types
export type SubscriptionStatus = "active" | "cancelled" | "expired" | "suspended";

export interface Subscription {
    id: string;
    userId: string;
    productId: string;
    tierId: string;
    status: SubscriptionStatus;
    currentPeriodStart: number;
    currentPeriodEnd: number;
    externalSubscriptionId: string | null;
    createdAt: number;
    updatedAt: number;
    cancelledAt: number | null;
}

export interface SubscriptionWithTier extends Subscription {
    tier: SubscriptionTier;
    product: ApiProduct;
}

// API Key Types
export type ApiKeyStatus = "active" | "revoked";

export interface ApiKey {
    id: string;
    subscriptionId: string;
    userId: string;
    keyHash: string;
    keyPrefix: string;
    name: string | null;
    status: ApiKeyStatus;
    allowedIps: string[] | null;
    allowedOrigins: string[] | null;
    lastUsedAt: number | null;
    createdAt: number;
    revokedAt: number | null;
}

export interface ApiKeyPublic {
    id: string;
    subscriptionId: string;
    keyPrefix: string;
    name: string | null;
    status: ApiKeyStatus;
    lastUsedAt: number | null;
    createdAt: number;
}

export interface ApiKeyWithSubscription extends ApiKey {
    subscription: SubscriptionWithTier;
}

// Usage Types
export interface Usage {
    id: string;
    subscriptionId: string;
    apiKeyId: string | null;
    periodStart: number;
    periodEnd: number;
    apiCalls: number;
    resourceCount: number;
    currentWindowStart: number | null;
    currentWindowCount: number;
    createdAt: number;
    updatedAt: number;
}

export interface QuotaStatus {
    subscriptionId: string;
    tier: string;
    apiCalls: { used: number; limit: number; remaining: number };
    resources: { used: number; limit: number; remaining: number };
    rateLimitRpm: number;
    isAtLimit: boolean;
    percentUsed: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
}

// Webhook Types
export type WebhookEventType =
    | "user.created"
    | "subscription.created"
    | "subscription.cancelled"
    | "subscription.tier_changed"
    | "usage.threshold_reached"
    | "usage.limit_reached"
    | "api_key.created"
    | "api_key.revoked";

export type WebhookStatus = "active" | "disabled" | "failed";
export type DeliveryStatus = "pending" | "success" | "failed";

export interface WebhookConfig {
    id: string;
    userId: string;
    url: string;
    secret: string;
    events: WebhookEventType[];
    status: WebhookStatus;
    lastSuccessAt: number | null;
    lastFailureAt: number | null;
    consecutiveFailures: number;
    createdAt: number;
    updatedAt: number;
}

export interface WebhookDelivery {
    id: string;
    webhookConfigId: string;
    eventType: WebhookEventType;
    eventId: string;
    payload: string;
    status: DeliveryStatus;
    attempts: number;
    responseStatus: number | null;
    responseBody: string | null;
    createdAt: number;
    deliveredAt: number | null;
}

export interface WebhookEvent {
    id: string;
    type: WebhookEventType;
    timestamp: number;
    data: Record<string, unknown>;
}

// Refresh Token Types
export interface RefreshToken {
    id: string;
    userId: string;
    tokenHash: string;
    deviceInfo: string | null;
    ipAddress: string | null;
    expiresAt: number;
    createdAt: number;
    revokedAt: number | null;
}

export interface EmailVerificationToken {
    id: string;
    userId: string;
    token: string;
    tokenHash: string;
    expiresAt: number;
    createdAt: number;
    verifiedAt: number | null;
}

// Auth Types
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

export interface AuthResult extends AuthTokens {
    user: UserPublic;
}

export interface JWTPayload {
    sub: string;
    email: string;
    tenant_id?: string;
    iat: number;
    exp: number;
}

// Service Result Type
export interface ServiceResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// Validation Result
export interface ValidateKeyResult {
    valid: boolean;
    reason?: "invalid" | "revoked" | "subscription_inactive" | "quota_exceeded" | "rate_limited";
    userId?: string;
    subscriptionId?: string;
    productId?: string;
    productSlug?: string;
    tier?: string;
    quotaStatus?: QuotaStatus;
    rateLimit?: RateLimitResult;
}
