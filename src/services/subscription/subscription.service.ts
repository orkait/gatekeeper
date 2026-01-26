import type { AuthRepository } from '../../repositories';
import type { ServiceResult } from '../../types';
import { generateId, ok, err, nowMs } from '../shared';
import type { 
    CreateSubscriptionInput, 
    Subscription, 
    SubscriptionItem, 
    SubscriptionStatus, 
    SubscriptionTier, 
    SubscriptionWithItems, 
    UpdateSubscriptionInput 
} from './types';

interface SubscriptionRow {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
    tier: string;
    status: string;
    current_period_end: number;
    created_at: number;
    updated_at: number;
    cancelled_at: number | null;
}

interface SubscriptionItemRow {
    [key: string]: unknown;
    id: string;
    subscription_id: string;
    service: string;
    enabled: number;
    created_at: number;
    updated_at: number;
}

// Default subscription period (30 days).
const DEFAULT_PERIOD_DAYS = 30;

// SubscriptionService - Tenant subscription management.
// Handles subscription creation, retrieval, and updates with tier
// and period tracking.
export class SubscriptionService {
    constructor(private repository: AuthRepository) {}

    async createSubscription(
        input: CreateSubscriptionInput
    ): Promise<ServiceResult<Subscription>> {
        // Check if tenant already has a subscription
        const existing = await this.getSubscription(input.tenantId);
        if (existing.success) {
            return err('Tenant already has a subscription');
        }

        const now = nowMs();
        const periodDays = input.periodDays ?? DEFAULT_PERIOD_DAYS;

        const subscription: Subscription = {
            id: generateId('sub'),
            tenantId: input.tenantId,
            tier: input.tier ?? 'free',
            status: 'active',
            currentPeriodEnd: now + periodDays * 24 * 60 * 60 * 1000,
            createdAt: now,
            updatedAt: now,
            cancelledAt: null,
        };

        await this.repository.rawRun(
            `INSERT INTO tenant_subscriptions (id, tenant_id, tier, status, current_period_end, created_at, updated_at, cancelled_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                subscription.id,
                subscription.tenantId,
                subscription.tier,
                subscription.status,
                subscription.currentPeriodEnd,
                subscription.createdAt,
                subscription.updatedAt,
                subscription.cancelledAt,
            ]
        );

        return ok(subscription);
    }

    async getSubscription(tenantId: string): Promise<ServiceResult<Subscription>> {
        const row = await this.repository.rawFirst<SubscriptionRow>(
            'SELECT * FROM tenant_subscriptions WHERE tenant_id = ?',
            [tenantId]
        );

        if (!row) {
            return err('Subscription not found');
        }

        return ok(this.mapRow(row));
    }

    async getSubscriptionById(id: string): Promise<ServiceResult<Subscription>> {
        const row = await this.repository.rawFirst<SubscriptionRow>(
            'SELECT * FROM tenant_subscriptions WHERE id = ?',
            [id]
        );

        if (!row) {
            return err('Subscription not found');
        }

        return ok(this.mapRow(row));
    }

    async updateSubscription(
        tenantId: string,
        input: UpdateSubscriptionInput
    ): Promise<ServiceResult<Subscription>> {
        const existing = await this.getSubscription(tenantId);
        if (!existing.success || !existing.data) {
            return err('Subscription not found');
        }

        const fields: string[] = [];
        const values: unknown[] = [];
        const now = nowMs();

        if (input.tier !== undefined) {
            fields.push('tier = ?');
            values.push(input.tier);
        }
        if (input.status !== undefined) {
            fields.push('status = ?');
            values.push(input.status);

            if (input.status === 'cancelled') {
                fields.push('cancelled_at = ?');
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

    async upgradeTier(
        tenantId: string,
        newTier: SubscriptionTier
    ): Promise<ServiceResult<Subscription>> {
        const existing = await this.getSubscription(tenantId);
        if (!existing.success || !existing.data) {
            return err('Subscription not found');
        }

        const tierOrder: Record<SubscriptionTier, number> = {
            free: 0,
            pro: 1,
            enterprise: 2,
        };

        if (tierOrder[newTier] <= tierOrder[existing.data.tier]) {
            return err('New tier must be higher than current tier');
        }

        return this.updateSubscription(tenantId, { tier: newTier });
    }

    async downgradeTier(
        tenantId: string,
        newTier: SubscriptionTier
    ): Promise<ServiceResult<Subscription>> {
        const existing = await this.getSubscription(tenantId);
        if (!existing.success || !existing.data) {
            return err('Subscription not found');
        }

        const tierOrder: Record<SubscriptionTier, number> = {
            free: 0,
            pro: 1,
            enterprise: 2,
        };

        if (tierOrder[newTier] >= tierOrder[existing.data.tier]) {
            return err('New tier must be lower than current tier');
        }

        return this.updateSubscription(tenantId, { tier: newTier });
    }

    async cancelSubscription(tenantId: string): Promise<ServiceResult<Subscription>> {
        return this.updateSubscription(tenantId, { status: 'cancelled' });
    }

    async renewSubscription(
        tenantId: string,
        periodDays?: number
    ): Promise<ServiceResult<Subscription>> {
        const existing = await this.getSubscription(tenantId);
        if (!existing.success || !existing.data) {
            return err('Subscription not found');
        }

        const days = periodDays ?? DEFAULT_PERIOD_DAYS;
        const now = nowMs();
        const baseTime = Math.max(now, existing.data.currentPeriodEnd);
        const newPeriodEnd = baseTime + days * 24 * 60 * 60 * 1000;

        await this.repository.rawRun(
            'UPDATE tenant_subscriptions SET status = ?, current_period_end = ?, updated_at = ? WHERE tenant_id = ?',
            ['active', newPeriodEnd, now, tenantId]
        );

        return this.getSubscription(tenantId);
    }

    async isActive(tenantId: string): Promise<boolean> {
        const result = await this.getSubscription(tenantId);
        if (!result.success || !result.data) {
            return false;
        }

        return (
            result.data.status === 'active' &&
            result.data.currentPeriodEnd > nowMs()
        );
    }

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

    async getSubscriptionWithItems(
        tenantId: string
    ): Promise<ServiceResult<SubscriptionWithItems>> {
        const subResult = await this.getSubscription(tenantId);
        if (!subResult.success || !subResult.data) {
            return err('Subscription not found');
        }

        const itemsResult = await this.repository.rawAll<SubscriptionItemRow>(
            'SELECT * FROM tenant_subscription_items WHERE subscription_id = ? ORDER BY service',
            [subResult.data.id]
        );

        const items = itemsResult.results.map(this.mapItemRow);

        return ok({
            ...subResult.data,
            items,
        });
    }

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

    async enableService(
        subscriptionId: string,
        service: string
    ): Promise<ServiceResult<SubscriptionItem>> {
        const now = nowMs();

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
            const id = generateId('si');
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

        return ok(this.mapItemRow(row!));
    }

    async disableService(
        subscriptionId: string,
        service: string
    ): Promise<ServiceResult<SubscriptionItem>> {
        const now = nowMs();

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
            const id = generateId('si');
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

        return ok(this.mapItemRow(row!));
    }

    async getSubscriptionItems(
        subscriptionId: string
    ): Promise<ServiceResult<SubscriptionItem[]>> {
        const result = await this.repository.rawAll<SubscriptionItemRow>(
            'SELECT * FROM tenant_subscription_items WHERE subscription_id = ? ORDER BY service',
            [subscriptionId]
        );

        const items = result.results.map(this.mapItemRow);
        return ok(items);
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private mapRow(row: SubscriptionRow): Subscription {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            tier: row.tier as SubscriptionTier,
            status: row.status as SubscriptionStatus,
            currentPeriodEnd: row.current_period_end,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            cancelledAt: row.cancelled_at,
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

// Create a SubscriptionService instance.
export function createSubscriptionService(
    repository: AuthRepository
): SubscriptionService {
    return new SubscriptionService(repository);
}
