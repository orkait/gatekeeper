import type { AuthStorageAdapter } from "./adapter";
import type {
    User, ApiProduct, SubscriptionTier, Subscription, SubscriptionWithTier,
    ApiKey, ApiKeyWithSubscription, Usage, WebhookConfig, WebhookDelivery, RefreshToken,
    WebhookEventType,
} from "../types";

export class MemoryAuthAdapter implements AuthStorageAdapter {
    private users = new Map<string, User>();
    private products = new Map<string, ApiProduct>();
    private tiers = new Map<string, SubscriptionTier>();
    private subscriptions = new Map<string, Subscription>();
    private apiKeys = new Map<string, ApiKey>();
    private usage = new Map<string, Usage>();
    private refreshTokens = new Map<string, RefreshToken>();
    private webhookConfigs = new Map<string, WebhookConfig>();
    private webhookDeliveries = new Map<string, WebhookDelivery>();

    // Users
    async createUser(user: User): Promise<void> {
        this.users.set(user.id, user);
    }

    async getUserById(id: string): Promise<User | null> {
        return this.users.get(id) || null;
    }

    async getUserByEmail(email: string): Promise<User | null> {
        for (const user of this.users.values()) {
            if (user.email === email) return user;
        }
        return null;
    }

    async getUserByGoogleId(googleId: string): Promise<User | null> {
        for (const user of this.users.values()) {
            if (user.googleId === googleId) return user;
        }
        return null;
    }

    async updateUser(id: string, updates: Partial<User>): Promise<void> {
        const user = this.users.get(id);
        if (user) {
            this.users.set(id, { ...user, ...updates, updatedAt: Date.now() });
        }
    }

    // Products
    async getProducts(): Promise<ApiProduct[]> {
        return [...this.products.values()].filter(p => p.status === "active");
    }

    async getProduct(idOrSlug: string): Promise<ApiProduct | null> {
        const product = this.products.get(idOrSlug);
        if (product) return product;
        for (const p of this.products.values()) {
            if (p.slug === idOrSlug) return p;
        }
        return null;
    }

    async createProduct(product: ApiProduct): Promise<void> {
        this.products.set(product.id, product);
    }

    // Tiers
    async getTiers(productId: string): Promise<SubscriptionTier[]> {
        return [...this.tiers.values()].filter(t => t.productId === productId && t.status === "active");
    }

    async getTier(id: string): Promise<SubscriptionTier | null> {
        return this.tiers.get(id) || null;
    }

    async createTier(tier: SubscriptionTier): Promise<void> {
        this.tiers.set(tier.id, tier);
    }

    // Subscriptions
    async createSubscription(subscription: Subscription): Promise<void> {
        this.subscriptions.set(subscription.id, subscription);
    }

    async getSubscription(id: string): Promise<Subscription | null> {
        return this.subscriptions.get(id) || null;
    }

    async getSubscriptionWithTier(id: string): Promise<SubscriptionWithTier | null> {
        const subscription = this.subscriptions.get(id);
        if (!subscription) return null;

        const tier = this.tiers.get(subscription.tierId);
        const product = this.products.get(subscription.productId);
        if (!tier || !product) return null;

        return { ...subscription, tier, product };
    }

    async getSubscriptionByUserAndProduct(userId: string, productId: string): Promise<Subscription | null> {
        for (const sub of this.subscriptions.values()) {
            if (sub.userId === userId && sub.productId === productId) return sub;
        }
        return null;
    }

    async getUserSubscriptions(userId: string): Promise<SubscriptionWithTier[]> {
        const results: SubscriptionWithTier[] = [];
        for (const sub of this.subscriptions.values()) {
            if (sub.userId === userId) {
                const tier = this.tiers.get(sub.tierId);
                const product = this.products.get(sub.productId);
                if (tier && product) {
                    results.push({ ...sub, tier, product });
                }
            }
        }
        return results;
    }

    async updateSubscription(id: string, updates: Partial<Subscription>): Promise<void> {
        const sub = this.subscriptions.get(id);
        if (sub) {
            this.subscriptions.set(id, { ...sub, ...updates, updatedAt: Date.now() });
        }
    }

    // API Keys
    async createApiKey(apiKey: ApiKey): Promise<void> {
        this.apiKeys.set(apiKey.id, apiKey);
    }

    async getApiKeyByHash(keyHash: string): Promise<ApiKeyWithSubscription | null> {
        for (const key of this.apiKeys.values()) {
            if (key.keyHash === keyHash) {
                const subWithTier = await this.getSubscriptionWithTier(key.subscriptionId);
                if (!subWithTier) return null;
                return { ...key, subscription: subWithTier };
            }
        }
        return null;
    }

    async getApiKeysByUser(userId: string): Promise<ApiKey[]> {
        return [...this.apiKeys.values()].filter(k => k.userId === userId);
    }

    async updateApiKey(id: string, updates: Partial<ApiKey>): Promise<void> {
        const key = this.apiKeys.get(id);
        if (key) {
            this.apiKeys.set(id, { ...key, ...updates });
        }
    }

    // Usage
    async getOrCreateUsage(subscriptionId: string, periodStart: number, periodEnd: number): Promise<Usage> {
        const key = `${subscriptionId}:${periodStart}`;
        let usage = this.usage.get(key);
        if (!usage) {
            const now = Date.now();
            usage = {
                id: `usg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                subscriptionId, apiKeyId: null, periodStart, periodEnd,
                apiCalls: 0, resourceCount: 0, currentWindowStart: null, currentWindowCount: 0,
                createdAt: now, updatedAt: now,
            };
            this.usage.set(key, usage);
        }
        return usage;
    }

    async incrementUsage(usageId: string, calls: number, resources: number): Promise<Usage> {
        for (const [key, usage] of this.usage.entries()) {
            if (usage.id === usageId) {
                const updated = {
                    ...usage,
                    apiCalls: usage.apiCalls + calls,
                    resourceCount: usage.resourceCount + resources,
                    updatedAt: Date.now(),
                };
                this.usage.set(key, updated);
                return updated;
            }
        }
        throw new Error("Usage not found");
    }

    async getUsage(subscriptionId: string, periodStart: number): Promise<Usage | null> {
        return this.usage.get(`${subscriptionId}:${periodStart}`) || null;
    }

    async updateUsageRateLimit(usageId: string, windowStart: number, windowCount: number): Promise<void> {
        for (const [key, usage] of this.usage.entries()) {
            if (usage.id === usageId) {
                this.usage.set(key, { ...usage, currentWindowStart: windowStart, currentWindowCount: windowCount, updatedAt: Date.now() });
                return;
            }
        }
    }

    // Refresh Tokens
    async createRefreshToken(token: RefreshToken): Promise<void> {
        this.refreshTokens.set(token.tokenHash, token);
    }

    async getRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
        const token = this.refreshTokens.get(tokenHash);
        if (token && !token.revokedAt) return token;
        return null;
    }

    async revokeRefreshToken(tokenHash: string): Promise<void> {
        const token = this.refreshTokens.get(tokenHash);
        if (token) {
            this.refreshTokens.set(tokenHash, { ...token, revokedAt: Date.now() });
        }
    }

    async revokeAllUserTokens(userId: string): Promise<void> {
        const now = Date.now();
        for (const [hash, token] of this.refreshTokens.entries()) {
            if (token.userId === userId && !token.revokedAt) {
                this.refreshTokens.set(hash, { ...token, revokedAt: now });
            }
        }
    }

    // Webhooks
    async getWebhookConfigs(userId: string): Promise<WebhookConfig[]> {
        return [...this.webhookConfigs.values()].filter(w => w.userId === userId);
    }

    async getActiveWebhooksForEvent(eventType: WebhookEventType): Promise<WebhookConfig[]> {
        return [...this.webhookConfigs.values()].filter(w => w.status === "active" && w.events.includes(eventType));
    }

    async createWebhookConfig(config: WebhookConfig): Promise<void> {
        this.webhookConfigs.set(config.id, config);
    }

    async updateWebhookConfig(id: string, updates: Partial<WebhookConfig>): Promise<void> {
        const config = this.webhookConfigs.get(id);
        if (config) {
            this.webhookConfigs.set(id, { ...config, ...updates, updatedAt: Date.now() });
        }
    }

    async deleteWebhookConfig(id: string): Promise<void> {
        this.webhookConfigs.delete(id);
    }

    async createDelivery(delivery: WebhookDelivery): Promise<void> {
        this.webhookDeliveries.set(delivery.id, delivery);
    }

    async updateDelivery(id: string, updates: Partial<WebhookDelivery>): Promise<void> {
        const delivery = this.webhookDeliveries.get(id);
        if (delivery) {
            this.webhookDeliveries.set(id, { ...delivery, ...updates });
        }
    }

    async getPendingDeliveries(limit: number): Promise<WebhookDelivery[]> {
        return [...this.webhookDeliveries.values()]
            .filter(d => d.status === "pending")
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(0, limit);
    }

    // Test helpers
    clear(): void {
        this.users.clear();
        this.products.clear();
        this.tiers.clear();
        this.subscriptions.clear();
        this.apiKeys.clear();
        this.usage.clear();
        this.refreshTokens.clear();
        this.webhookConfigs.clear();
        this.webhookDeliveries.clear();
    }
}
