import type { AuthRepository } from '../repositories/auth.repository';
import type { ServiceResult } from '../types';

/**
 * Subscription tier.
 */
export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

/**
 * Subscription status.
 */
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due';

/**
 * Subscription record.
 */
export interface Subscription {
    id: string;
    tenantId: string;
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    currentPeriodEnd: number;
    createdAt: number;
    updatedAt: number;
    canceledAt: number | null;
}

/**
 * Subscription with enabled services.
 */
export interface SubscriptionWithItems extends Subscription {
    items: SubscriptionItem[];
}

/**
 * Subscription item (per-service enablement).
 */
export interface SubscriptionItem {
    id: string;
    subscriptionId: string;
    service: string;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
}

/**
 * Input for creating a subscription.
 */
export interface CreateSubscriptionInput {
    tenantId: string;
    tier?: SubscriptionTier;
    periodDays?: number;
}

/**
 * Input for updating a subscription.
 */
export interface UpdateSubscriptionInput {
    tier?: SubscriptionTier;
    status?: SubscriptionStatus;
    periodDays?: number;
}

/**
 * Database row for subscriptions table.
 */
interface SubscriptionRow {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
    tier: string;
    status: string;
    current_period_end: number;
    created_at: number;
    updated_at: number;
    canceled_at: number | null;
}

/**
 * Database row for subscription items table.
 */
interface SubscriptionItemRow {
    [key: string]: unknown;
    id: string;
    subscription_id: string;
    service: string;
    enabled: number;
    created_at: number;
    updated_at: number;
}

/**
 * Default subscription period (30 days).
 */
const DEFAULT_PERIOD_DAYS = 30;

/**
 * SubscriptionService - Tenant subscription management.
 *
 * Handles subscription creation, retrieval, and updates with tier
 * and period tracking.
 */
export class SubscriptionService {
    constructor(private repository: AuthRepository) {}

    /**
     * Create a subscription for a tenant.
     */
    async createSubscription(
        input: CreateSubscriptionInput
    ): Promise<ServiceResult<Subscription>> {
        // Check if tenant already has a subscription
        const existing = await this.getSubscription(input.tenantId);
        if (existing.success) {
            return { success: false, error: 'Tenant already has a subscription' };
        }

        const now = Date.now();
        const periodDays = input.periodDays ?? DEFAULT_PERIOD_DAYS;

        const subscription: Subscription = {
            id: this.generateId('sub'),
            tenantId: input.tenantId,
            tier: input.tier ?? 'free',
            status: 'active',
            currentPeriodEnd: now + periodDays * 24 * 60 * 60 * 1000,
            createdAt: now,
            updatedAt: now,
            canceledAt: null,
        };

        await this.repository.rawRun(
            `INSERT INTO tenant_subscriptions (id, tenant_id, tier, status, current_period_end, created_at, updated_at, canceled_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                subscription.id,
                subscription.tenantId,
                subscription.tier,
                subscription.status,
                subscription.currentPeriodEnd,
                subscription.createdAt,
                subscription.updatedAt,
                subscription.canceledAt,
            ]
        );

        return { success: true, data: subscription };
    }

    /**
     * Get subscription for a tenant.
     */
    async getSubscription(tenantId: string): Promise<ServiceResult<Subscription>> {
        const row = await this.repository.rawFirst<SubscriptionRow>(
            'SELECT * FROM tenant_subscriptions WHERE tenant_id = ?',
            [tenantId]
        );

        if (!row) {
            return { success: false, error: 'Subscription not found' };
        }

        return { success: true, data: this.mapRow(row) };
    }

    /**
     * Get subscription by ID.
     */
    async getSubscriptionById(id: string): Promise<ServiceResult<Subscription>> {
        const row = await this.repository.rawFirst<SubscriptionRow>(
            'SELECT * FROM tenant_subscriptions WHERE id = ?',
            [id]
        );

        if (!row) {
            return { success: false, error: 'Subscription not found' };
        }

        return { success: true, data: this.mapRow(row) };
    }

    /**
     * Update a subscription.
     */
    async updateSubscription(
        tenantId: string,
        input: UpdateSubscriptionInput
    ): Promise<ServiceResult<Subscription>> {
        const existing = await this.getSubscription(tenantId);
        if (!existing.success || !existing.data) {
            return { success: false, error: 'Subscription not found' };
        }

        const fields: string[] = [];
        const values: unknown[] = [];
        const now = Date.now();

        if (input.tier !== undefined) {
            fields.push('tier = ?');
            values.push(input.tier);
        }
        if (input.status !== undefined) {
            fields.push('status = ?');
            values.push(input.status);

            if (input.status === 'canceled') {
                fields.push('canceled_at = ?');
                values.push(now);
            }
        }
        if (input.periodDays !== undefined) {
            fields.push('current_period_end = ?');
            values.push(now + input.periodDays * 24 * 60 * 60 * 1000);
        }

        fields.push('updated_at = ?');
        values.push(now);
        values.push(tenantId);

        await this.repository.rawRun(
            `UPDATE tenant_subscriptions SET ${fields.join(', ')} WHERE tenant_id = ?`,
            values
        );

        return this.getSubscription(tenantId);
    }

    /**
     * Upgrade subscription tier.
     */
    async upgradeTier(
        tenantId: string,
        newTier: SubscriptionTier
    ): Promise<ServiceResult<Subscription>> {
        const existing = await this.getSubscription(tenantId);
        if (!existing.success || !existing.data) {
            return { success: false, error: 'Subscription not found' };
        }

        const tierOrder: Record<SubscriptionTier, number> = {
            free: 0,
            pro: 1,
            enterprise: 2,
        };

        if (tierOrder[newTier] <= tierOrder[existing.data.tier]) {
            return { success: false, error: 'New tier must be higher than current tier' };
        }

        return this.updateSubscription(tenantId, { tier: newTier });
    }

    /**
     * Downgrade subscription tier.
     */
    async downgradeTier(
        tenantId: string,
        newTier: SubscriptionTier
    ): Promise<ServiceResult<Subscription>> {
        const existing = await this.getSubscription(tenantId);
        if (!existing.success || !existing.data) {
            return { success: false, error: 'Subscription not found' };
        }

        const tierOrder: Record<SubscriptionTier, number> = {
            free: 0,
            pro: 1,
            enterprise: 2,
        };

        if (tierOrder[newTier] >= tierOrder[existing.data.tier]) {
            return { success: false, error: 'New tier must be lower than current tier' };
        }

        return this.updateSubscription(tenantId, { tier: newTier });
    }

    /**
     * Cancel subscription.
     */
    async cancelSubscription(tenantId: string): Promise<ServiceResult<Subscription>> {
        return this.updateSubscription(tenantId, { status: 'canceled' });
    }

    /**
     * Renew subscription for another period.
     */
    async renewSubscription(
        tenantId: string,
        periodDays?: number
    ): Promise<ServiceResult<Subscription>> {
        const existing = await this.getSubscription(tenantId);
        if (!existing.success || !existing.data) {
            return { success: false, error: 'Subscription not found' };
        }

        const days = periodDays ?? DEFAULT_PERIOD_DAYS;
        const now = Date.now();
        const baseTime = Math.max(now, existing.data.currentPeriodEnd);
        const newPeriodEnd = baseTime + days * 24 * 60 * 60 * 1000;

        await this.repository.rawRun(
            'UPDATE tenant_subscriptions SET status = ?, current_period_end = ?, updated_at = ? WHERE tenant_id = ?',
            ['active', newPeriodEnd, now, tenantId]
        );

        return this.getSubscription(tenantId);
    }

    /**
     * Check if subscription is active.
     */
    async isActive(tenantId: string): Promise<boolean> {
        const result = await this.getSubscription(tenantId);
        if (!result.success || !result.data) {
            return false;
        }

        return (
            result.data.status === 'active' &&
            result.data.currentPeriodEnd > Date.now()
        );
    }

    /**
     * Get the tier for a tenant.
     */
    async getTier(tenantId: string): Promise<SubscriptionTier | null> {
        const result = await this.getSubscription(tenantId);
        if (!result.success || !result.data) {
            return null;
        }
        return result.data.tier;
    }

    // ========================================================================
    // Subscription Items (Per-Service Enablement)
    // ========================================================================

    /**
     * Get subscription with items for a tenant.
     */
    async getSubscriptionWithItems(
        tenantId: string
    ): Promise<ServiceResult<SubscriptionWithItems>> {
        const subResult = await this.getSubscription(tenantId);
        if (!subResult.success || !subResult.data) {
            return { success: false, error: 'Subscription not found' };
        }

        const itemsResult = await this.repository.rawAll<SubscriptionItemRow>(
            'SELECT * FROM tenant_subscription_items WHERE subscription_id = ? ORDER BY service',
            [subResult.data.id]
        );

        const items = itemsResult.results.map(this.mapItemRow);

        return {
            success: true,
            data: {
                ...subResult.data,
                items,
            },
        };
    }

    /**
     * Check if a service is enabled for a subscription.
     */
    async isServiceEnabled(subscriptionId: string, service: string): Promise<boolean> {
        const row = await this.repository.rawFirst<SubscriptionItemRow>(
            'SELECT * FROM tenant_subscription_items WHERE subscription_id = ? AND service = ?',
            [subscriptionId, service]
        );

        if (!row) {
            // Service not configured, default to disabled
            return false;
        }

        return row.enabled === 1;
    }

    /**
     * Enable a service for a subscription.
     */
    async enableService(
        subscriptionId: string,
        service: string
    ): Promise<ServiceResult<SubscriptionItem>> {
        const now = Date.now();

        // Check if item exists
        const existing = await this.repository.rawFirst<SubscriptionItemRow>(
            'SELECT * FROM tenant_subscription_items WHERE subscription_id = ? AND service = ?',
            [subscriptionId, service]
        );

        if (existing) {
            // Update existing
            await this.repository.rawRun(
                'UPDATE tenant_subscription_items SET enabled = 1, updated_at = ? WHERE subscription_id = ? AND service = ?',
                [now, subscriptionId, service]
            );
        } else {
            // Create new
            const id = this.generateId('si');
            await this.repository.rawRun(
                `INSERT INTO tenant_subscription_items (id, subscription_id, service, enabled, created_at, updated_at)
                 VALUES (?, ?, ?, 1, ?, ?)`,
                [id, subscriptionId, service, now, now]
            );
        }

        const row = await this.repository.rawFirst<SubscriptionItemRow>(
            'SELECT * FROM tenant_subscription_items WHERE subscription_id = ? AND service = ?',
            [subscriptionId, service]
        );

        return { success: true, data: this.mapItemRow(row!) };
    }

    /**
     * Disable a service for a subscription.
     */
    async disableService(
        subscriptionId: string,
        service: string
    ): Promise<ServiceResult<SubscriptionItem>> {
        const now = Date.now();

        // Check if item exists
        const existing = await this.repository.rawFirst<SubscriptionItemRow>(
            'SELECT * FROM tenant_subscription_items WHERE subscription_id = ? AND service = ?',
            [subscriptionId, service]
        );

        if (existing) {
            // Update existing
            await this.repository.rawRun(
                'UPDATE tenant_subscription_items SET enabled = 0, updated_at = ? WHERE subscription_id = ? AND service = ?',
                [now, subscriptionId, service]
            );
        } else {
            // Create new (disabled)
            const id = this.generateId('si');
            await this.repository.rawRun(
                `INSERT INTO tenant_subscription_items (id, subscription_id, service, enabled, created_at, updated_at)
                 VALUES (?, ?, ?, 0, ?, ?)`,
                [id, subscriptionId, service, now, now]
            );
        }

        const row = await this.repository.rawFirst<SubscriptionItemRow>(
            'SELECT * FROM tenant_subscription_items WHERE subscription_id = ? AND service = ?',
            [subscriptionId, service]
        );

        return { success: true, data: this.mapItemRow(row!) };
    }

    /**
     * Get all subscription items (enabled services).
     */
    async getSubscriptionItems(
        subscriptionId: string
    ): Promise<ServiceResult<SubscriptionItem[]>> {
        const result = await this.repository.rawAll<SubscriptionItemRow>(
            'SELECT * FROM tenant_subscription_items WHERE subscription_id = ? ORDER BY service',
            [subscriptionId]
        );

        const items = result.results.map(this.mapItemRow);
        return { success: true, data: items };
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private generateId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    private mapRow(row: SubscriptionRow): Subscription {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            tier: row.tier as SubscriptionTier,
            status: row.status as SubscriptionStatus,
            currentPeriodEnd: row.current_period_end,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            canceledAt: row.canceled_at,
        };
    }

    private mapItemRow(row: SubscriptionItemRow): SubscriptionItem {
        return {
            id: row.id,
            subscriptionId: row.subscription_id,
            service: row.service,
            enabled: row.enabled === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

/**
 * Create a SubscriptionService instance.
 */
export function createSubscriptionService(
    repository: AuthRepository
): SubscriptionService {
    return new SubscriptionService(repository);
}
