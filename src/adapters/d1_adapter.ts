import type { AuthStorageAdapter } from "./adapter";
import type {
    User, ApiProduct, SubscriptionTier, Subscription, SubscriptionWithTier,
    ApiKey, ApiKeyWithSubscription, Usage, WebhookConfig, WebhookDelivery, RefreshToken,
    WebhookEventType,
} from "../types";

// Database row types
interface UserRow {
    id: string; email: string; password_hash: string | null; email_verified: number;
    google_id: string | null; name: string | null; avatar_url: string | null;
    status: string; created_at: number; updated_at: number; last_login_at: number | null;
}

interface ProductRow {
    id: string; name: string; slug: string; description: string | null;
    status: string; created_at: number; updated_at: number;
}

interface TierRow {
    id: string; product_id: string; name: string; slug: string;
    api_calls_limit: number; resource_limit: number; rate_limit_rpm: number;
    features: string | null; status: string; created_at: number;
}

interface SubscriptionRow {
    id: string; user_id: string; product_id: string; tier_id: string;
    status: string; current_period_start: number; current_period_end: number;
    external_subscription_id: string | null; created_at: number; updated_at: number;
    cancelled_at: number | null;
}

interface ApiKeyRow {
    id: string; subscription_id: string; user_id: string; key_hash: string;
    key_prefix: string; name: string | null; status: string;
    allowed_ips: string | null; allowed_origins: string | null;
    last_used_at: number | null; created_at: number; revoked_at: number | null;
}

interface UsageRow {
    id: string; subscription_id: string; api_key_id: string | null;
    period_start: number; period_end: number; api_calls: number; resource_count: number;
    current_window_start: number | null; current_window_count: number;
    created_at: number; updated_at: number;
}

interface WebhookConfigRow {
    id: string; user_id: string; url: string; secret: string; events: string;
    status: string; last_success_at: number | null; last_failure_at: number | null;
    consecutive_failures: number; created_at: number; updated_at: number;
}

interface WebhookDeliveryRow {
    id: string; webhook_config_id: string; event_type: string; event_id: string;
    payload: string; status: string; attempts: number;
    response_status: number | null; response_body: string | null;
    created_at: number; delivered_at: number | null;
}

interface RefreshTokenRow {
    id: string; user_id: string; token_hash: string; device_info: string | null;
    ip_address: string | null; expires_at: number; created_at: number; revoked_at: number | null;
}

// Joined row type for subscription with tier and product (with SQL aliases)
interface SubscriptionWithTierRow extends SubscriptionRow {
    tier_id_full: string; tier_product_id: string; tier_name: string; tier_slug: string;
    api_calls_limit: number; resource_limit: number; rate_limit_rpm: number;
    features: string | null; tier_status: string; tier_created_at: number;
    prod_id: string; prod_name: string; prod_slug: string;
    prod_description: string | null; prod_status: string;
    prod_created_at: number; prod_updated_at: number;
}

// Joined row type for API key with subscription, tier, and product
interface ApiKeyWithSubscriptionRow extends ApiKeyRow {
    sub_id: string; sub_user_id: string; sub_product_id: string; sub_tier_id: string;
    sub_status: string; current_period_start: number; current_period_end: number;
    external_subscription_id: string | null; sub_created_at: number; sub_updated_at: number;
    cancelled_at: number | null;
    tier_id_full: string; tier_product_id: string; tier_name: string; tier_slug: string;
    api_calls_limit: number; resource_limit: number; rate_limit_rpm: number;
    features: string | null; tier_status: string; tier_created_at: number;
    prod_id: string; prod_name: string; prod_slug: string;
    prod_description: string | null; prod_status: string;
    prod_created_at: number; prod_updated_at: number;
}

export class D1AuthAdapter implements AuthStorageAdapter {
    constructor(private db: D1Database) {}

    // Users
    async createUser(user: User): Promise<void> {
        await this.db.prepare(`
            INSERT INTO users (id, email, password_hash, email_verified, google_id, name, avatar_url, status, created_at, updated_at, last_login_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            user.id, user.email, user.passwordHash, user.emailVerified ? 1 : 0,
            user.googleId, user.name, user.avatarUrl, user.status,
            user.createdAt, user.updatedAt, user.lastLoginAt
        ).run();
    }

    async getUserById(id: string): Promise<User | null> {
        const row = await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
        return row ? this.mapUser(row) : null;
    }

    async getUserByEmail(email: string): Promise<User | null> {
        const row = await this.db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();
        return row ? this.mapUser(row) : null;
    }

    async getUserByGoogleId(googleId: string): Promise<User | null> {
        const row = await this.db.prepare("SELECT * FROM users WHERE google_id = ?").bind(googleId).first<UserRow>();
        return row ? this.mapUser(row) : null;
    }

    async updateUser(id: string, updates: Partial<User>): Promise<void> {
        const fields: string[] = [];
        const values: (string | number | null)[] = [];

        if (updates.email !== undefined) { fields.push("email = ?"); values.push(updates.email); }
        if (updates.passwordHash !== undefined) { fields.push("password_hash = ?"); values.push(updates.passwordHash); }
        if (updates.emailVerified !== undefined) { fields.push("email_verified = ?"); values.push(updates.emailVerified ? 1 : 0); }
        if (updates.googleId !== undefined) { fields.push("google_id = ?"); values.push(updates.googleId); }
        if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
        if (updates.avatarUrl !== undefined) { fields.push("avatar_url = ?"); values.push(updates.avatarUrl); }
        if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
        if (updates.lastLoginAt !== undefined) { fields.push("last_login_at = ?"); values.push(updates.lastLoginAt); }

        fields.push("updated_at = ?");
        values.push(Date.now());
        values.push(id);

        await this.db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    }

    // Products
    async getProducts(): Promise<ApiProduct[]> {
        const rows = await this.db.prepare("SELECT * FROM api_products WHERE status = 'active' ORDER BY name").all<ProductRow>();
        return rows.results.map(this.mapProduct);
    }

    async getProduct(idOrSlug: string): Promise<ApiProduct | null> {
        const row = await this.db.prepare("SELECT * FROM api_products WHERE id = ? OR slug = ?").bind(idOrSlug, idOrSlug).first<ProductRow>();
        return row ? this.mapProduct(row) : null;
    }

    async createProduct(product: ApiProduct): Promise<void> {
        await this.db.prepare(`
            INSERT INTO api_products (id, name, slug, description, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(product.id, product.name, product.slug, product.description, product.status, product.createdAt, product.updatedAt).run();
    }

    // Tiers
    async getTiers(productId: string): Promise<SubscriptionTier[]> {
        const rows = await this.db.prepare("SELECT * FROM subscription_tiers WHERE product_id = ? AND status = 'active'").bind(productId).all<TierRow>();
        return rows.results.map(this.mapTier);
    }

    async getTier(id: string): Promise<SubscriptionTier | null> {
        const row = await this.db.prepare("SELECT * FROM subscription_tiers WHERE id = ?").bind(id).first<TierRow>();
        return row ? this.mapTier(row) : null;
    }

    async createTier(tier: SubscriptionTier): Promise<void> {
        await this.db.prepare(`
            INSERT INTO subscription_tiers (id, product_id, name, slug, api_calls_limit, resource_limit, rate_limit_rpm, features, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            tier.id, tier.productId, tier.name, tier.slug,
            tier.apiCallsLimit, tier.resourceLimit, tier.rateLimitRpm,
            JSON.stringify(tier.features), tier.status, tier.createdAt
        ).run();
    }

    // Subscriptions
    async createSubscription(subscription: Subscription): Promise<void> {
        await this.db.prepare(`
            INSERT INTO subscriptions (id, user_id, product_id, tier_id, status, current_period_start, current_period_end, external_subscription_id, created_at, updated_at, cancelled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            subscription.id, subscription.userId, subscription.productId, subscription.tierId,
            subscription.status, subscription.currentPeriodStart, subscription.currentPeriodEnd,
            subscription.externalSubscriptionId, subscription.createdAt, subscription.updatedAt, subscription.cancelledAt
        ).run();
    }

    async getSubscription(id: string): Promise<Subscription | null> {
        const row = await this.db.prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id).first<SubscriptionRow>();
        return row ? this.mapSubscription(row) : null;
    }

    async getSubscriptionWithTier(id: string): Promise<SubscriptionWithTier | null> {
        const row = await this.db.prepare(`
            SELECT s.*, t.id as tier_id_full, t.product_id as tier_product_id, t.name as tier_name, t.slug as tier_slug,
                   t.api_calls_limit, t.resource_limit, t.rate_limit_rpm, t.features, t.status as tier_status, t.created_at as tier_created_at,
                   p.id as prod_id, p.name as prod_name, p.slug as prod_slug, p.description as prod_description, p.status as prod_status,
                   p.created_at as prod_created_at, p.updated_at as prod_updated_at
            FROM subscriptions s
            JOIN subscription_tiers t ON s.tier_id = t.id
            JOIN api_products p ON s.product_id = p.id
            WHERE s.id = ?
        `).bind(id).first<SubscriptionWithTierRow>();
        return row ? this.mapSubscriptionWithTier(row) : null;
    }

    async getSubscriptionByUserAndProduct(userId: string, productId: string): Promise<Subscription | null> {
        const row = await this.db.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND product_id = ?").bind(userId, productId).first<SubscriptionRow>();
        return row ? this.mapSubscription(row) : null;
    }

    async getUserSubscriptions(userId: string): Promise<SubscriptionWithTier[]> {
        const rows = await this.db.prepare(`
            SELECT s.*, t.id as tier_id_full, t.product_id as tier_product_id, t.name as tier_name, t.slug as tier_slug,
                   t.api_calls_limit, t.resource_limit, t.rate_limit_rpm, t.features, t.status as tier_status, t.created_at as tier_created_at,
                   p.id as prod_id, p.name as prod_name, p.slug as prod_slug, p.description as prod_description, p.status as prod_status,
                   p.created_at as prod_created_at, p.updated_at as prod_updated_at
            FROM subscriptions s
            JOIN subscription_tiers t ON s.tier_id = t.id
            JOIN api_products p ON s.product_id = p.id
            WHERE s.user_id = ?
        `).bind(userId).all<SubscriptionWithTierRow>();
        return rows.results.map(r => this.mapSubscriptionWithTier(r));
    }

    async updateSubscription(id: string, updates: Partial<Subscription>): Promise<void> {
        const fields: string[] = [];
        const values: (string | number | null)[] = [];

        if (updates.tierId !== undefined) { fields.push("tier_id = ?"); values.push(updates.tierId); }
        if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
        if (updates.currentPeriodStart !== undefined) { fields.push("current_period_start = ?"); values.push(updates.currentPeriodStart); }
        if (updates.currentPeriodEnd !== undefined) { fields.push("current_period_end = ?"); values.push(updates.currentPeriodEnd); }
        if (updates.externalSubscriptionId !== undefined) { fields.push("external_subscription_id = ?"); values.push(updates.externalSubscriptionId); }
        if (updates.cancelledAt !== undefined) { fields.push("cancelled_at = ?"); values.push(updates.cancelledAt); }

        fields.push("updated_at = ?");
        values.push(Date.now());
        values.push(id);

        await this.db.prepare(`UPDATE subscriptions SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    }

    // API Keys
    async createApiKey(apiKey: ApiKey): Promise<void> {
        await this.db.prepare(`
            INSERT INTO api_keys (id, subscription_id, user_id, key_hash, key_prefix, name, status, allowed_ips, allowed_origins, last_used_at, created_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            apiKey.id, apiKey.subscriptionId, apiKey.userId, apiKey.keyHash, apiKey.keyPrefix,
            apiKey.name, apiKey.status,
            apiKey.allowedIps ? JSON.stringify(apiKey.allowedIps) : null,
            apiKey.allowedOrigins ? JSON.stringify(apiKey.allowedOrigins) : null,
            apiKey.lastUsedAt, apiKey.createdAt, apiKey.revokedAt
        ).run();
    }

    async getApiKeyByHash(keyHash: string): Promise<ApiKeyWithSubscription | null> {
        const row = await this.db.prepare(`
            SELECT k.*, s.id as sub_id, s.user_id as sub_user_id, s.product_id as sub_product_id, s.tier_id as sub_tier_id,
                   s.status as sub_status, s.current_period_start, s.current_period_end, s.external_subscription_id,
                   s.created_at as sub_created_at, s.updated_at as sub_updated_at, s.cancelled_at,
                   t.id as tier_id_full, t.product_id as tier_product_id, t.name as tier_name, t.slug as tier_slug,
                   t.api_calls_limit, t.resource_limit, t.rate_limit_rpm, t.features, t.status as tier_status, t.created_at as tier_created_at,
                   p.id as prod_id, p.name as prod_name, p.slug as prod_slug, p.description as prod_description, p.status as prod_status,
                   p.created_at as prod_created_at, p.updated_at as prod_updated_at
            FROM api_keys k
            JOIN subscriptions s ON k.subscription_id = s.id
            JOIN subscription_tiers t ON s.tier_id = t.id
            JOIN api_products p ON s.product_id = p.id
            WHERE k.key_hash = ?
        `).bind(keyHash).first<ApiKeyWithSubscriptionRow>();
        return row ? this.mapApiKeyWithSubscription(row) : null;
    }

    async getApiKeysByUser(userId: string): Promise<ApiKey[]> {
        const rows = await this.db.prepare("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all<ApiKeyRow>();
        return rows.results.map(this.mapApiKey);
    }

    async updateApiKey(id: string, updates: Partial<ApiKey>): Promise<void> {
        const fields: string[] = [];
        const values: (string | number | null)[] = [];

        if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
        if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
        if (updates.lastUsedAt !== undefined) { fields.push("last_used_at = ?"); values.push(updates.lastUsedAt); }
        if (updates.revokedAt !== undefined) { fields.push("revoked_at = ?"); values.push(updates.revokedAt); }

        values.push(id);
        await this.db.prepare(`UPDATE api_keys SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    }

    // Usage
    async getOrCreateUsage(subscriptionId: string, periodStart: number, periodEnd: number): Promise<Usage> {
        let usage = await this.getUsage(subscriptionId, periodStart);
        if (usage) return usage;

        const id = `usg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const now = Date.now();
        await this.db.prepare(`
            INSERT INTO usage (id, subscription_id, api_key_id, period_start, period_end, api_calls, resource_count, current_window_start, current_window_count, created_at, updated_at)
            VALUES (?, ?, NULL, ?, ?, 0, 0, NULL, 0, ?, ?)
        `).bind(id, subscriptionId, periodStart, periodEnd, now, now).run();

        return { id, subscriptionId, apiKeyId: null, periodStart, periodEnd, apiCalls: 0, resourceCount: 0, currentWindowStart: null, currentWindowCount: 0, createdAt: now, updatedAt: now };
    }

    async incrementUsage(usageId: string, calls: number, resources: number): Promise<Usage> {
        const now = Date.now();
        await this.db.prepare(`
            UPDATE usage SET api_calls = api_calls + ?, resource_count = resource_count + ?, updated_at = ? WHERE id = ?
        `).bind(calls, resources, now, usageId).run();

        const row = await this.db.prepare("SELECT * FROM usage WHERE id = ?").bind(usageId).first<UsageRow>();
        return this.mapUsage(row!);
    }

    async getUsage(subscriptionId: string, periodStart: number): Promise<Usage | null> {
        const row = await this.db.prepare("SELECT * FROM usage WHERE subscription_id = ? AND period_start = ?").bind(subscriptionId, periodStart).first<UsageRow>();
        return row ? this.mapUsage(row) : null;
    }

    async updateUsageRateLimit(usageId: string, windowStart: number, windowCount: number): Promise<void> {
        await this.db.prepare("UPDATE usage SET current_window_start = ?, current_window_count = ?, updated_at = ? WHERE id = ?")
            .bind(windowStart, windowCount, Date.now(), usageId).run();
    }

    // Refresh Tokens
    async createRefreshToken(token: RefreshToken): Promise<void> {
        await this.db.prepare(`
            INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, ip_address, expires_at, created_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(token.id, token.userId, token.tokenHash, token.deviceInfo, token.ipAddress, token.expiresAt, token.createdAt, token.revokedAt).run();
    }

    async getRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
        const row = await this.db.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL").bind(tokenHash).first<RefreshTokenRow>();
        return row ? this.mapRefreshToken(row) : null;
    }

    async revokeRefreshToken(tokenHash: string): Promise<void> {
        await this.db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?").bind(Date.now(), tokenHash).run();
    }

    async revokeAllUserTokens(userId: string): Promise<void> {
        await this.db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(Date.now(), userId).run();
    }

    // Webhooks
    async getWebhookConfigs(userId: string): Promise<WebhookConfig[]> {
        const rows = await this.db.prepare("SELECT * FROM webhook_configs WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all<WebhookConfigRow>();
        return rows.results.map(this.mapWebhookConfig);
    }

    async getActiveWebhooksForEvent(eventType: WebhookEventType): Promise<WebhookConfig[]> {
        const rows = await this.db.prepare("SELECT * FROM webhook_configs WHERE status = 'active'").all<WebhookConfigRow>();
        return rows.results.map(this.mapWebhookConfig).filter(w => w.events.includes(eventType));
    }

    async createWebhookConfig(config: WebhookConfig): Promise<void> {
        await this.db.prepare(`
            INSERT INTO webhook_configs (id, user_id, url, secret, events, status, last_success_at, last_failure_at, consecutive_failures, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            config.id, config.userId, config.url, config.secret, JSON.stringify(config.events),
            config.status, config.lastSuccessAt, config.lastFailureAt, config.consecutiveFailures,
            config.createdAt, config.updatedAt
        ).run();
    }

    async updateWebhookConfig(id: string, updates: Partial<WebhookConfig>): Promise<void> {
        const fields: string[] = [];
        const values: (string | number | null)[] = [];

        if (updates.url !== undefined) { fields.push("url = ?"); values.push(updates.url); }
        if (updates.events !== undefined) { fields.push("events = ?"); values.push(JSON.stringify(updates.events)); }
        if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
        if (updates.lastSuccessAt !== undefined) { fields.push("last_success_at = ?"); values.push(updates.lastSuccessAt); }
        if (updates.lastFailureAt !== undefined) { fields.push("last_failure_at = ?"); values.push(updates.lastFailureAt); }
        if (updates.consecutiveFailures !== undefined) { fields.push("consecutive_failures = ?"); values.push(updates.consecutiveFailures); }

        fields.push("updated_at = ?");
        values.push(Date.now());
        values.push(id);

        await this.db.prepare(`UPDATE webhook_configs SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    }

    async deleteWebhookConfig(id: string): Promise<void> {
        await this.db.prepare("DELETE FROM webhook_configs WHERE id = ?").bind(id).run();
    }

    async createDelivery(delivery: WebhookDelivery): Promise<void> {
        await this.db.prepare(`
            INSERT INTO webhook_deliveries (id, webhook_config_id, event_type, event_id, payload, status, attempts, response_status, response_body, created_at, delivered_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            delivery.id, delivery.webhookConfigId, delivery.eventType, delivery.eventId,
            delivery.payload, delivery.status, delivery.attempts,
            delivery.responseStatus, delivery.responseBody, delivery.createdAt, delivery.deliveredAt
        ).run();
    }

    async updateDelivery(id: string, updates: Partial<WebhookDelivery>): Promise<void> {
        const fields: string[] = [];
        const values: (string | number | null)[] = [];

        if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
        if (updates.attempts !== undefined) { fields.push("attempts = ?"); values.push(updates.attempts); }
        if (updates.responseStatus !== undefined) { fields.push("response_status = ?"); values.push(updates.responseStatus); }
        if (updates.responseBody !== undefined) { fields.push("response_body = ?"); values.push(updates.responseBody); }
        if (updates.deliveredAt !== undefined) { fields.push("delivered_at = ?"); values.push(updates.deliveredAt); }

        values.push(id);
        await this.db.prepare(`UPDATE webhook_deliveries SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    }

    async getPendingDeliveries(limit: number): Promise<WebhookDelivery[]> {
        const rows = await this.db.prepare("SELECT * FROM webhook_deliveries WHERE status = 'pending' ORDER BY created_at LIMIT ?").bind(limit).all<WebhookDeliveryRow>();
        return rows.results.map(this.mapWebhookDelivery);
    }

    // Mappers
    private mapUser(row: UserRow): User {
        return {
            id: row.id, email: row.email, passwordHash: row.password_hash,
            emailVerified: row.email_verified === 1, googleId: row.google_id,
            name: row.name, avatarUrl: row.avatar_url, status: row.status as User["status"],
            createdAt: row.created_at, updatedAt: row.updated_at, lastLoginAt: row.last_login_at,
        };
    }

    private mapProduct(row: ProductRow): ApiProduct {
        return {
            id: row.id, name: row.name, slug: row.slug, description: row.description,
            status: row.status as ApiProduct["status"], createdAt: row.created_at, updatedAt: row.updated_at,
        };
    }

    private mapTier(row: TierRow): SubscriptionTier {
        return {
            id: row.id, productId: row.product_id, name: row.name, slug: row.slug,
            apiCallsLimit: row.api_calls_limit, resourceLimit: row.resource_limit,
            rateLimitRpm: row.rate_limit_rpm, features: row.features ? JSON.parse(row.features) : [],
            status: row.status as SubscriptionTier["status"], createdAt: row.created_at,
        };
    }

    private mapSubscription(row: SubscriptionRow): Subscription {
        return {
            id: row.id, userId: row.user_id, productId: row.product_id, tierId: row.tier_id,
            status: row.status as Subscription["status"], currentPeriodStart: row.current_period_start,
            currentPeriodEnd: row.current_period_end, externalSubscriptionId: row.external_subscription_id,
            createdAt: row.created_at, updatedAt: row.updated_at, cancelledAt: row.cancelled_at,
        };
    }

    private mapSubscriptionWithTier(row: SubscriptionWithTierRow): SubscriptionWithTier {
        return {
            ...this.mapSubscription(row),
            tier: {
                id: row.tier_id_full, productId: row.tier_product_id,
                name: row.tier_name, slug: row.tier_slug,
                apiCallsLimit: row.api_calls_limit, resourceLimit: row.resource_limit,
                rateLimitRpm: row.rate_limit_rpm, features: row.features ? JSON.parse(row.features) : [],
                status: row.tier_status as SubscriptionTier["status"], createdAt: row.tier_created_at,
            },
            product: {
                id: row.prod_id, name: row.prod_name, slug: row.prod_slug,
                description: row.prod_description, status: row.prod_status as ApiProduct["status"],
                createdAt: row.prod_created_at, updatedAt: row.prod_updated_at,
            },
        };
    }

    private mapApiKey(row: ApiKeyRow): ApiKey {
        return {
            id: row.id, subscriptionId: row.subscription_id, userId: row.user_id,
            keyHash: row.key_hash, keyPrefix: row.key_prefix, name: row.name,
            status: row.status as ApiKey["status"],
            allowedIps: row.allowed_ips ? JSON.parse(row.allowed_ips) : null,
            allowedOrigins: row.allowed_origins ? JSON.parse(row.allowed_origins) : null,
            lastUsedAt: row.last_used_at, createdAt: row.created_at, revokedAt: row.revoked_at,
        };
    }

    private mapApiKeyWithSubscription(row: ApiKeyWithSubscriptionRow): ApiKeyWithSubscription {
        const subscriptionRow: SubscriptionWithTierRow = {
            id: row.sub_id,
            user_id: row.sub_user_id,
            product_id: row.sub_product_id,
            tier_id: row.sub_tier_id,
            status: row.sub_status,
            current_period_start: row.current_period_start,
            current_period_end: row.current_period_end,
            external_subscription_id: row.external_subscription_id,
            created_at: row.sub_created_at,
            updated_at: row.sub_updated_at,
            cancelled_at: row.cancelled_at,
            tier_id_full: row.tier_id_full,
            tier_product_id: row.tier_product_id,
            tier_name: row.tier_name,
            tier_slug: row.tier_slug,
            api_calls_limit: row.api_calls_limit,
            resource_limit: row.resource_limit,
            rate_limit_rpm: row.rate_limit_rpm,
            features: row.features,
            tier_status: row.tier_status,
            tier_created_at: row.tier_created_at,
            prod_id: row.prod_id,
            prod_name: row.prod_name,
            prod_slug: row.prod_slug,
            prod_description: row.prod_description,
            prod_status: row.prod_status,
            prod_created_at: row.prod_created_at,
            prod_updated_at: row.prod_updated_at,
        };
        return {
            ...this.mapApiKey(row),
            subscription: this.mapSubscriptionWithTier(subscriptionRow),
        };
    }

    private mapUsage(row: UsageRow): Usage {
        return {
            id: row.id, subscriptionId: row.subscription_id, apiKeyId: row.api_key_id,
            periodStart: row.period_start, periodEnd: row.period_end,
            apiCalls: row.api_calls, resourceCount: row.resource_count,
            currentWindowStart: row.current_window_start, currentWindowCount: row.current_window_count,
            createdAt: row.created_at, updatedAt: row.updated_at,
        };
    }

    private mapRefreshToken(row: RefreshTokenRow): RefreshToken {
        return {
            id: row.id, userId: row.user_id, tokenHash: row.token_hash,
            deviceInfo: row.device_info, ipAddress: row.ip_address,
            expiresAt: row.expires_at, createdAt: row.created_at, revokedAt: row.revoked_at,
        };
    }

    private mapWebhookConfig(row: WebhookConfigRow): WebhookConfig {
        return {
            id: row.id, userId: row.user_id, url: row.url, secret: row.secret,
            events: JSON.parse(row.events), status: row.status as WebhookConfig["status"],
            lastSuccessAt: row.last_success_at, lastFailureAt: row.last_failure_at,
            consecutiveFailures: row.consecutive_failures, createdAt: row.created_at, updatedAt: row.updated_at,
        };
    }

    private mapWebhookDelivery(row: WebhookDeliveryRow): WebhookDelivery {
        return {
            id: row.id, webhookConfigId: row.webhook_config_id,
            eventType: row.event_type as WebhookEventType, eventId: row.event_id,
            payload: row.payload, status: row.status as WebhookDelivery["status"],
            attempts: row.attempts, responseStatus: row.response_status, responseBody: row.response_body,
            createdAt: row.created_at, deliveredAt: row.delivered_at,
        };
    }
}
