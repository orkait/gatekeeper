import type {
    User, ApiProduct, SubscriptionTier, Subscription, SubscriptionWithTier,
    ApiKey, ApiKeyWithSubscription, Usage, WebhookConfig, WebhookDelivery, RefreshToken,
    WebhookEventType,
} from "../types";

export interface AuthStorageAdapter {
    // Users
    createUser(user: User): Promise<void>;
    getUserById(id: string): Promise<User | null>;
    getUserByEmail(email: string): Promise<User | null>;
    getUserByGoogleId(googleId: string): Promise<User | null>;
    updateUser(id: string, updates: Partial<User>): Promise<void>;

    // Products
    getProducts(): Promise<ApiProduct[]>;
    getProduct(idOrSlug: string): Promise<ApiProduct | null>;
    createProduct(product: ApiProduct): Promise<void>;

    // Tiers
    getTiers(productId: string): Promise<SubscriptionTier[]>;
    getTier(id: string): Promise<SubscriptionTier | null>;
    createTier(tier: SubscriptionTier): Promise<void>;

    // Subscriptions
    createSubscription(subscription: Subscription): Promise<void>;
    getSubscription(id: string): Promise<Subscription | null>;
    getSubscriptionWithTier(id: string): Promise<SubscriptionWithTier | null>;
    getSubscriptionByUserAndProduct(userId: string, productId: string): Promise<Subscription | null>;
    getUserSubscriptions(userId: string): Promise<SubscriptionWithTier[]>;
    updateSubscription(id: string, updates: Partial<Subscription>): Promise<void>;

    // API Keys
    createApiKey(apiKey: ApiKey): Promise<void>;
    getApiKeyByHash(keyHash: string): Promise<ApiKeyWithSubscription | null>;
    getApiKeysByUser(userId: string): Promise<ApiKey[]>;
    updateApiKey(id: string, updates: Partial<ApiKey>): Promise<void>;

    // Usage
    getOrCreateUsage(subscriptionId: string, periodStart: number, periodEnd: number): Promise<Usage>;
    incrementUsage(usageId: string, calls: number, resources: number): Promise<Usage>;
    getUsage(subscriptionId: string, periodStart: number): Promise<Usage | null>;
    updateUsageRateLimit(usageId: string, windowStart: number, windowCount: number): Promise<void>;

    // Refresh Tokens
    createRefreshToken(token: RefreshToken): Promise<void>;
    getRefreshToken(tokenHash: string): Promise<RefreshToken | null>;
    revokeRefreshToken(tokenHash: string): Promise<void>;
    revokeAllUserTokens(userId: string): Promise<void>;

    // Webhooks
    getWebhookConfigs(userId: string): Promise<WebhookConfig[]>;
    getActiveWebhooksForEvent(eventType: WebhookEventType): Promise<WebhookConfig[]>;
    createWebhookConfig(config: WebhookConfig): Promise<void>;
    updateWebhookConfig(id: string, updates: Partial<WebhookConfig>): Promise<void>;
    deleteWebhookConfig(id: string): Promise<void>;
    createDelivery(delivery: WebhookDelivery): Promise<void>;
    updateDelivery(id: string, updates: Partial<WebhookDelivery>): Promise<void>;
    getPendingDeliveries(limit: number): Promise<WebhookDelivery[]>;
}

export type AdapterConfig =
    | { type: "memory" }
    | { type: "d1"; db: D1Database };

export async function createAdapter(config: AdapterConfig): Promise<AuthStorageAdapter> {
    if (config.type === "memory") {
        const { MemoryAuthAdapter } = await import("./memory_adapter");
        return new MemoryAuthAdapter();
    }
    const { D1AuthAdapter } = await import("./d1_adapter");
    return new D1AuthAdapter(config.db);
}
