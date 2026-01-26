import type { AuthRepository } from '../../repositories';
import type { ServiceResult } from '../../types';
import type { SubscriptionTier } from '../subscription/types';
import { generateId, ok, err, nowMs } from '../shared';
import type {
    FeatureFlag,
    CreateFeatureFlagInput,
    UpdateFeatureFlagInput,
    FeatureCheckContext
} from './types';

interface FeatureFlagRow {
    [key: string]: unknown;
    id: string;
    name: string;
    description: string | null;
    enabled_tiers: string;
    enabled_tenants: string;
    rollout_percentage: number;
    active: number;
    created_at: number;
    updated_at: number;
}

// FeatureFlagService - Feature flag management and evaluation.
// Supports:
// - Tier-based enablement (free, pro, enterprise)
// - Tenant-specific enablement
// - Percentage-based rollout (deterministic by tenant_id)
export class FeatureFlagService {
    constructor(private repository: AuthRepository) { }

    // ========================================================================
    // Feature Checking
    // ========================================================================

    async featureEnabled(
        flagName: string,
        context: FeatureCheckContext
    ): Promise<boolean> {
        const flag = await this.getFeatureFlagByName(flagName);

        if (!flag.success || !flag.data) {
            // Flag doesn't exist, treat as disabled
            return false;
        }

        const featureFlag = flag.data;

        // Check if flag is active
        if (!featureFlag.active) {
            return false;
        }

        // Check if tenant is explicitly enabled
        if (featureFlag.enabledTenants.includes(context.tenantId)) {
            return true;
        }

        // Check tier-based enablement
        if (context.tier && featureFlag.enabledTiers.includes(context.tier)) {
            return true;
        }

        // If no tier provided, look up the subscription
        if (!context.tier && featureFlag.enabledTiers.length > 0) {
            const tier = await this.getTenantTier(context.tenantId);
            if (tier && featureFlag.enabledTiers.includes(tier)) {
                return true;
            }
        }

        // Check rollout percentage (deterministic by tenant_id)
        if (featureFlag.rolloutPercentage > 0) {
            const hash = this.hashTenantId(context.tenantId, flagName);
            const percentage = hash % 100;
            return percentage < featureFlag.rolloutPercentage;
        }

        return false;
    }

    async featuresEnabled(
        flagNames: string[],
        context: FeatureCheckContext
    ): Promise<Record<string, boolean>> {
        const results: Record<string, boolean> = {};

        // Fetch tier once if not provided
        let tier = context.tier;
        if (!tier) {
            tier = await this.getTenantTier(context.tenantId) ?? undefined;
        }

        const contextWithTier = { ...context, tier };

        for (const flagName of flagNames) {
            results[flagName] = await this.featureEnabled(flagName, contextWithTier);
        }

        return results;
    }

    // ========================================================================
    // CRUD Operations
    // ========================================================================

    async createFeatureFlag(input: CreateFeatureFlagInput): Promise<ServiceResult<FeatureFlag>> {
        // Check for duplicate name
        const existing = await this.getFeatureFlagByName(input.name);
        if (existing.success && existing.data) {
            return err('Feature flag with this name already exists');
        }

        const now = nowMs();
        const flag: FeatureFlag = {
            id: generateId('ff'),
            name: input.name,
            description: input.description ?? null,
            enabledTiers: input.enabledTiers ?? [],
            enabledTenants: input.enabledTenants ?? [],
            rolloutPercentage: input.rolloutPercentage ?? 0,
            active: input.active ?? true,
            createdAt: now,
            updatedAt: now,
        };

        await this.repository.rawRun(
            `INSERT INTO feature_flags (id, name, description, enabled_tiers, enabled_tenants, rollout_percentage, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                flag.id,
                flag.name,
                flag.description,
                JSON.stringify(flag.enabledTiers),
                JSON.stringify(flag.enabledTenants),
                flag.rolloutPercentage,
                flag.active ? 1 : 0,
                flag.createdAt,
                flag.updatedAt,
            ]
        );

        return ok(flag);
    }

    async getFeatureFlag(id: string): Promise<ServiceResult<FeatureFlag>> {
        const row = await this.repository.rawFirst<FeatureFlagRow>(
            'SELECT * FROM feature_flags WHERE id = ?',
            [id]
        );

        if (!row) {
            return err('Feature flag not found');
        }

        return ok(this.mapRow(row));
    }

    async getFeatureFlagByName(name: string): Promise<ServiceResult<FeatureFlag>> {
        const row = await this.repository.rawFirst<FeatureFlagRow>(
            'SELECT * FROM feature_flags WHERE name = ?',
            [name]
        );

        if (!row) {
            return err('Feature flag not found');
        }

        return ok(this.mapRow(row));
    }

    async listFeatureFlags(activeOnly: boolean = false): Promise<ServiceResult<FeatureFlag[]>> {
        const sql = activeOnly
            ? 'SELECT * FROM feature_flags WHERE active = 1 ORDER BY name'
            : 'SELECT * FROM feature_flags ORDER BY name';

        const result = await this.repository.rawAll<FeatureFlagRow>(sql, []);
        const flags = result.results.map(this.mapRow);

        return ok(flags);
    }

    async updateFeatureFlag(
        id: string,
        input: UpdateFeatureFlagInput
    ): Promise<ServiceResult<FeatureFlag>> {
        const existing = await this.getFeatureFlag(id);
        if (!existing.success || !existing.data) {
            return err('Feature flag not found');
        }

        // Check for duplicate name if name is being changed
        if (input.name && input.name !== existing.data.name) {
            const duplicate = await this.getFeatureFlagByName(input.name);
            if (duplicate.success && duplicate.data) {
                return err('Feature flag with this name already exists');
            }
        }

        const fields: string[] = [];
        const values: unknown[] = [];

        if (input.name !== undefined) {
            fields.push('name = ?');
            values.push(input.name);
        }
        if (input.description !== undefined) {
            fields.push('description = ?');
            values.push(input.description);
        }
        if (input.enabledTiers !== undefined) {
            fields.push('enabled_tiers = ?');
            values.push(JSON.stringify(input.enabledTiers));
        }
        if (input.enabledTenants !== undefined) {
            fields.push('enabled_tenants = ?');
            values.push(JSON.stringify(input.enabledTenants));
        }
        if (input.rolloutPercentage !== undefined) {
            fields.push('rollout_percentage = ?');
            values.push(input.rolloutPercentage);
        }
        if (input.active !== undefined) {
            fields.push('active = ?');
            values.push(input.active ? 1 : 0);
        }

        if (fields.length > 0) {
            fields.push('updated_at = ?');
            values.push(nowMs());
            values.push(id);

            await this.repository.rawRun(
                `UPDATE feature_flags SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
        }

        return this.getFeatureFlag(id);
    }

    async deleteFeatureFlag(id: string): Promise<ServiceResult<void>> {
        const existing = await this.getFeatureFlag(id);
        if (!existing.success || !existing.data) {
            return err('Feature flag not found');
        }

        await this.repository.rawRun(
            'DELETE FROM feature_flags WHERE id = ?',
            [id]
        );

        return ok(undefined);
    }

    async toggleFeatureFlag(id: string): Promise<ServiceResult<FeatureFlag>> {
        const existing = await this.getFeatureFlag(id);
        if (!existing.success || !existing.data) {
            return err('Feature flag not found');
        }

        return this.updateFeatureFlag(id, { active: !existing.data.active });
    }

    async enableForTenant(flagId: string, tenantId: string): Promise<ServiceResult<FeatureFlag>> {
        const existing = await this.getFeatureFlag(flagId);
        if (!existing.success || !existing.data) {
            return err('Feature flag not found');
        }

        const enabledTenants = [...existing.data.enabledTenants];
        if (!enabledTenants.includes(tenantId)) {
            enabledTenants.push(tenantId);
        }

        return this.updateFeatureFlag(flagId, { enabledTenants });
    }

    async disableForTenant(flagId: string, tenantId: string): Promise<ServiceResult<FeatureFlag>> {
        const existing = await this.getFeatureFlag(flagId);
        if (!existing.success || !existing.data) {
            return err('Feature flag not found');
        }

        const enabledTenants = existing.data.enabledTenants.filter(t => t !== tenantId);

        return this.updateFeatureFlag(flagId, { enabledTenants });
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private async getTenantTier(tenantId: string): Promise<SubscriptionTier | null> {
        const row = await this.repository.rawFirst<{ tier: string }>(
            'SELECT tier FROM subscriptions WHERE tenant_id = ? AND status = ?',
            [tenantId, 'active']
        );

        if (!row) {
            return null;
        }

        return row.tier as SubscriptionTier;
    }

    // Generate a deterministic hash from tenant ID and flag name.
    // This ensures the same tenant gets the same result for a given flag.
    private hashTenantId(tenantId: string, flagName: string): number {
        const str = `${tenantId}:${flagName}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    private mapRow(row: FeatureFlagRow): FeatureFlag {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            enabledTiers: JSON.parse(row.enabled_tiers || '[]'),
            enabledTenants: JSON.parse(row.enabled_tenants || '[]'),
            rolloutPercentage: row.rollout_percentage,
            active: row.active === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

// Create a FeatureFlagService instance.
export function createFeatureFlagService(repository: AuthRepository): FeatureFlagService {
    return new FeatureFlagService(repository);
}
